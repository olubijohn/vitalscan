# VitalScan Supabase migration guide

This guide moves the VitalScan frontend away from the Replit API and its in-memory store. The companion `VitalScanSupabase.jsx` file is a portable React entry point that reads and writes Supabase directly through the Supabase JavaScript client.

The migration has two non-negotiable security rules:

1. Never put the Supabase service-role key in a browser, mobile bundle, Git repository, or client-side environment variable.
2. Never expose raw kiosk codes or unrestricted health results through a public table query. Use Row Level Security (RLS) and security-definer RPCs for privileged operations.

## 1. Create the Supabase project

1. Create a project at Supabase.
2. Choose a region close to your users.
3. Copy the **Project URL** and **anon public key** from Project Settings → API.
4. Enable email/password authentication under Authentication → Providers.
5. Decide whether email confirmation is required. If it is enabled, users must confirm before signing in.
6. Keep the service-role key only in a trusted server, Edge Function, or CI secret store. The exported JSX does not need it.

## 2. Create the database schema

Run the following SQL in the Supabase SQL Editor. Run it as one migration file in source control.

```sql
create extension if not exists pgcrypto;

create type public.app_role as enum ('super_admin','tenant_admin','tenant_staff','kiosk_operator','subscriber');
create type public.record_status as enum ('active','invited','suspended','deleted');
create type public.scan_status as enum ('pending','completed','aborted');

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null default 'Corporate',
  address text not null default '',
  status record_status not null default 'active',
  credit_balance integer not null default 0 check (credit_balance >= 0),
  kiosk_enabled boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null default '',
  phone text not null default '',
  whatsapp_number text not null default '',
  date_of_birth date,
  biological_sex text,
  role app_role not null default 'subscriber',
  workspace_id uuid references public.workspaces(id) on delete set null,
  status record_status not null default 'active',
  created_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role app_role not null,
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table public.subscribers (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  full_name text not null,
  email text not null default '',
  phone text not null default '',
  whatsapp_number text not null default '',
  date_of_birth date,
  biological_sex text,
  height_cm integer,
  weight_kg numeric,
  national_id_passport text,
  consent_tenant_view_results boolean not null default false,
  is_guest boolean not null default false,
  status record_status not null default 'active',
  created_at timestamptz not null default now()
);

create table public.devices (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  device_code text not null unique,
  label text not null,
  type text not null default 'camera',
  location text not null default '',
  status record_status not null default 'active',
  last_active_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.scans (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete set null,
  subscriber_id uuid not null references public.subscribers(id) on delete cascade,
  device_id uuid references public.devices(id) on delete set null,
  operator_user_id uuid references public.profiles(id) on delete set null,
  status scan_status not null default 'pending',
  source text not null default 'camera' check (source in ('camera','manual')),
  credit_owner_type text not null check (credit_owner_type in ('tenant','subscriber')),
  credit_used integer not null default 0 check (credit_used >= 0),
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.scan_results (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null unique references public.scans(id) on delete cascade,
  heart_rate numeric,
  respiratory_rate numeric,
  systolic_bp numeric,
  diastolic_bp numeric,
  oxygen_saturation numeric,
  stress_index numeric,
  wellness_score numeric,
  cardiovascular_age numeric,
  cvd_risk_percentage numeric,
  telemetry jsonb not null default '{}'::jsonb,
  signal_quality jsonb not null default '{}'::jsonb,
  low_confidence_flags jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table public.self_reports (
  id uuid primary key default gen_random_uuid(),
  subscriber_id uuid not null references public.subscribers(id) on delete cascade,
  recorded_at timestamptz not null default now(),
  heart_rate numeric,
  respiratory_rate numeric,
  systolic_bp numeric,
  diastolic_bp numeric,
  oxygen_saturation numeric,
  stress_index numeric,
  wellness_score numeric,
  symptoms text,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  subscriber_id uuid references public.subscribers(id) on delete cascade,
  amount integer not null,
  entry_type text not null check (entry_type in ('grant','consume','refund','request')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.workspace_secrets (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  kiosk_code_hash text,
  updated_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete set null,
  actor_user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  resource_type text not null,
  resource_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index scans_subscriber_started_idx on public.scans(subscriber_id, started_at desc);
create index scans_workspace_started_idx on public.scans(workspace_id, started_at desc);
create index self_reports_subscriber_recorded_idx on public.self_reports(subscriber_id, recorded_at desc);
create index devices_workspace_idx on public.devices(workspace_id);
```

## 3. Create profile rows automatically

Create this trigger so a Supabase Auth account receives a profile row. New users start as subscribers. A trusted admin flow must promote staff; never let the browser choose an admin role.

```sql
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, coalesce(new.email, ''), coalesce(new.raw_user_meta_data->>'full_name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();
```

## 4. Add helper functions for authorization

These functions are used by RLS and by the kiosk settings UI. Replace the `workspace_members` role rules with your exact organization policy if staff permissions differ.

```sql
create or replace function public.is_workspace_member(target_workspace uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = target_workspace
      and wm.user_id = auth.uid()
      and wm.role in ('tenant_admin','tenant_staff','kiosk_operator','super_admin')
  );
$$;

create or replace function public.hash_kiosk_code(raw_code text)
returns text language sql immutable
as $$ select encode(digest(raw_code, 'sha256'), 'hex'); $$;

create or replace function public.set_workspace_kiosk_code(
  p_workspace_id uuid, p_kiosk_code text, p_kiosk_enabled boolean
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (
    select 1 from public.workspace_members
    where workspace_id = p_workspace_id and user_id = auth.uid() and role in ('tenant_admin','super_admin')
  ) then raise exception 'not authorized'; end if;
  if p_kiosk_code !~ '^[0-9]{6}$' then raise exception 'kiosk code must contain six digits'; end if;
  insert into public.workspace_secrets(workspace_id, kiosk_code_hash)
  values (p_workspace_id, public.hash_kiosk_code(p_kiosk_code))
  on conflict (workspace_id) do update set kiosk_code_hash = excluded.kiosk_code_hash, updated_at = now();
  update public.workspaces set kiosk_enabled = p_kiosk_enabled where id = p_workspace_id;
  insert into public.audit_logs(workspace_id, actor_user_id, action, resource_type, metadata)
  values (p_workspace_id, auth.uid(), 'kiosk_settings_updated', 'workspace', jsonb_build_object('kiosk_enabled', p_kiosk_enabled));
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.verify_kiosk_access(
  p_workspace_id uuid, p_kiosk_code text, p_device_id uuid
)
returns boolean
language sql security definer set search_path = public
as $$
  select exists (
    select 1 from public.workspaces w
    join public.workspace_secrets s on s.workspace_id = w.id
    join public.devices d on d.workspace_id = w.id
    where w.id = p_workspace_id and w.status = 'active' and w.kiosk_enabled
      and s.kiosk_code_hash = public.hash_kiosk_code(p_kiosk_code)
      and d.id = p_device_id and d.status = 'active'
  );
$$;
```

## 5. Enable RLS

The browser uses the anon key, so every table must have RLS enabled. Start restrictive and add only the policies your screens need.

```sql
alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.subscribers enable row level security;
alter table public.devices enable row level security;
alter table public.scans enable row level security;
alter table public.scan_results enable row level security;
alter table public.self_reports enable row level security;
alter table public.credit_ledger enable row level security;
alter table public.workspace_secrets enable row level security;
alter table public.audit_logs enable row level security;

create policy "users read own profile" on public.profiles for select using (id = auth.uid());
create policy "users update own profile" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

create policy "members read workspace" on public.workspaces for select using (public.is_workspace_member(id));
create policy "members read workspace members" on public.workspace_members for select using (user_id = auth.uid() or public.is_workspace_member(workspace_id));

create policy "subscribers read own record" on public.subscribers for select using (user_id = auth.uid());
create policy "members read subscribers" on public.subscribers for select using (public.is_workspace_member(workspace_id));
create policy "subscribers update own record" on public.subscribers for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "workspace staff create subscribers" on public.subscribers for insert with check (public.is_workspace_member(workspace_id));

create policy "members read devices" on public.devices for select using (public.is_workspace_member(workspace_id));
create policy "admins create devices" on public.devices for insert with check (public.is_workspace_member(workspace_id));

create policy "subscribers read own scans" on public.scans for select using (subscriber_id in (select id from public.subscribers where user_id = auth.uid()));
create policy "members read workspace scans" on public.scans for select using (public.is_workspace_member(workspace_id));
create policy "authenticated create scans" on public.scans for insert with check (auth.uid() is not null);
create policy "operators update scans" on public.scans for update using (operator_user_id = auth.uid() or public.is_workspace_member(workspace_id));

create policy "subscribers read own results" on public.scan_results for select using (scan_id in (select id from public.scans where subscriber_id in (select id from public.subscribers where user_id = auth.uid())));
create policy "members read consented results" on public.scan_results for select using (scan_id in (select s.id from public.scans s join public.subscribers sub on sub.id = s.subscriber_id where public.is_workspace_member(s.workspace_id) and sub.consent_tenant_view_results));
create policy "scan owner creates results" on public.scan_results for insert with check (scan_id in (select id from public.scans where operator_user_id = auth.uid() or subscriber_id in (select id from public.subscribers where user_id = auth.uid())));

create policy "subscribers manage own reports" on public.self_reports for all using (subscriber_id in (select id from public.subscribers where user_id = auth.uid())) with check (subscriber_id in (select id from public.subscribers where user_id = auth.uid()));
create policy "members read consented reports" on public.self_reports for select using (public.is_workspace_member((select workspace_id from public.subscribers where id = subscriber_id)) and (select consent_tenant_view_results from public.subscribers where id = subscriber_id));
```

Do not create a `select *` policy on `workspace_secrets`. The kiosk code hash must only be read inside a security-definer function.

## 6. Install and configure the JSX file

In a new React + Vite project:

```bash
npm install react react-dom @supabase/supabase-js
```

Create `.env.local`:

```bash
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_PUBLIC_ANON_KEY
```

Copy `VitalScanSupabase.jsx` into `src/` and use it as your entry point:

```jsx
import "./index.css";
import "./VitalScanSupabase.jsx";
```

The file expects an element with `id="root"` in `index.html`.

For a production deployment, configure the same two variables in the hosting platform’s environment settings. Do not commit `.env.local`.

## 7. Configure the official FaceHeart/FHVitals SDK

The exported file intentionally calls:

```js
window.FHVitals.measure({ subscriberId })
```

That is a small adapter boundary, not a claim about a particular vendor SDK method name. Before go-live:

1. Obtain the official SDK package and license from FaceHeart.
2. Load the vendor SDK according to its documentation.
3. Implement `window.FHVitals.measure` or change `ScanPanel.start()` to the official API.
4. Map the vendor response in `normalizeMeasurement()`.
5. Confirm the vendor’s consent, camera, retention, and regional processing requirements.
6. Remove all demo or test measurement code from production builds.
7. Test abort, low signal, camera denial, browser refresh, duplicate clicks, and network loss.

The app marks a scan aborted if the SDK fails. It does not insert made-up vitals.

## 8. Seed the first workspace administrator

Use a trusted server-side script or Supabase Edge Function. Do not promote a user from the browser:

1. Create the user in Authentication.
2. Insert a workspace row.
3. Insert a `profiles` row with `role = 'tenant_admin'` and `workspace_id`.
4. Insert a matching `workspace_members` row.
5. Insert initial credits into `credit_ledger`.
6. Verify that the user can see the workspace but cannot see another workspace.

For Super Admin access, use a server-only administrative operation and require MFA outside this starter file.

## 9. Complete kiosk setup

1. Create a device in the Devices tab. The app allocates a `VS-XXXXXXXX` device code and stores the UUID.
2. Set a six-digit kiosk code in Workspace settings.
3. Add the kiosk operator to `workspace_members` with `role = 'kiosk_operator'`.
4. Build a dedicated kiosk route that collects operator email, password, kiosk code, and device ID.
5. Call `verify_kiosk_access` from a trusted endpoint or Edge Function before unlocking the kiosk.
6. Bind every kiosk scan to `device_id` and `operator_user_id`.
7. Require the kiosk code again before leaving the kiosk route.
8. Do not display subscriber names or health readings on the kiosk screen unless your privacy policy explicitly permits it.

For higher assurance, use a short-lived kiosk session token issued by an Edge Function instead of keeping an unlocked browser session indefinitely.

## 10. Implement credit enforcement atomically

The starter UI writes scan rows, but production credit consumption should be an atomic Postgres function. A safe flow is:

1. Begin a transaction in a database function.
2. Lock the subscriber/workspace credit balance.
3. Verify the tenant is active and the kiosk is enabled.
4. Verify the device belongs to the workspace.
5. Insert one `credit_ledger` consume row.
6. Insert the pending scan.
7. Reject if the balance is insufficient.

Do not trust a client-provided `credit_used`, `workspace_id`, `operator_user_id`, or `device_id`; derive or validate them server-side.

## 11. Validate the migration

Run this checklist before switching users:

- Subscriber can register, sign in, edit profile, and toggle consent.
- Subscriber profile is read-only until Edit is pressed.
- Subscriber sees a combined, clickable timeline of camera scans and manual entries.
- A private subscriber’s workspace history shows timestamps but masks readings.
- A consented subscriber’s workspace history shows readings.
- Staff cannot query another workspace by changing a URL or UUID.
- A kiosk cannot start with the wrong password, code, disabled workspace, or foreign device ID.
- Kiosk exit requires the code again.
- Every completed scan has a device ID and operator ID when run from a kiosk.
- Device IDs and scan counts are visible to authorized staff.
- CSV reports contain user IDs, not subscriber names.
- Browser refresh does not lose sessions.
- A failed SDK measurement creates an aborted scan and no result row.
- RLS is enabled on every table.
- The anon key cannot read `workspace_secrets`.
- Backups, retention, deletion, and export requests are documented.

## 12. Deploy

1. Run the SQL migration in a staging Supabase project.
2. Point a staging build at staging Supabase variables.
3. Perform the validation checklist with test accounts.
4. Add database backups and monitoring.
5. Set production environment variables in your hosting provider.
6. Deploy the React app.
7. Monitor Auth, Postgres, Edge Function, and browser errors.
8. Rotate any credentials that were ever pasted into source control or chat.

The companion JSX is a migration-ready foundation, not a substitute for a licensed clinical SDK integration, legal privacy review, penetration test, or production-grade server-side credit and kiosk authorization.