create extension if not exists pgcrypto;

do $$ begin
  create type public.app_role as enum ('super_admin','tenant_admin','tenant_staff','kiosk_operator','subscriber');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.record_status as enum ('active','invited','suspended','deleted');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.scan_status as enum ('pending','completed','aborted');
exception when duplicate_object then null; end $$;

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null default 'Corporate',
  address text not null default '',
  status public.record_status not null default 'active',
  credit_balance integer not null default 0 check (credit_balance >= 0),
  kiosk_enabled boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null default '',
  full_name text not null default '',
  phone text not null default '',
  whatsapp_number text not null default '',
  date_of_birth date,
  biological_sex text,
  role public.app_role not null default 'subscriber',
  workspace_id uuid references public.workspaces(id) on delete set null,
  status public.record_status not null default 'active',
  created_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table if not exists public.subscribers (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  full_name text not null,
  email text not null default '',
  phone text not null default '',
  whatsapp_number text not null default '',
  date_of_birth date,
  biological_sex text,
  height_cm integer check (height_cm is null or height_cm between 50 and 250),
  weight_kg numeric check (weight_kg is null or weight_kg between 20 and 350),
  national_id_passport text,
  consent_tenant_view_results boolean not null default false,
  is_guest boolean not null default false,
  status public.record_status not null default 'active',
  created_at timestamptz not null default now()
);

create table if not exists public.devices (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  device_code text not null unique,
  label text not null,
  type text not null default 'camera',
  location text not null default '',
  status public.record_status not null default 'active',
  last_active_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.scans (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete set null,
  subscriber_id uuid not null references public.subscribers(id) on delete cascade,
  device_id uuid references public.devices(id) on delete set null,
  operator_user_id uuid references public.profiles(id) on delete set null,
  status public.scan_status not null default 'pending',
  source text not null default 'camera' check (source in ('camera','manual')),
  credit_owner_type text not null check (credit_owner_type in ('tenant','subscriber')),
  credit_used integer not null default 0 check (credit_used >= 0),
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.scan_results (
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

create table if not exists public.self_reports (
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

create table if not exists public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  subscriber_id uuid references public.subscribers(id) on delete cascade,
  amount integer not null,
  entry_type text not null check (entry_type in ('grant','consume','refund','request')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.workspace_secrets (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  kiosk_code_hash text,
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete set null,
  actor_user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  resource_type text not null,
  resource_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists scans_subscriber_started_idx on public.scans(subscriber_id, started_at desc);
create index if not exists scans_workspace_started_idx on public.scans(workspace_id, started_at desc);
create index if not exists self_reports_subscriber_recorded_idx on public.self_reports(subscriber_id, recorded_at desc);
create index if not exists devices_workspace_idx on public.devices(workspace_id);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, coalesce(new.email, ''), coalesce(new.raw_user_meta_data->>'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.is_workspace_member(target_workspace uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = target_workspace
      and wm.user_id = auth.uid()
      and wm.role in ('tenant_admin','tenant_staff','kiosk_operator','super_admin')
  );
$$;

create or replace function public.hash_kiosk_code(raw_code text)
returns text language sql immutable as $$
  select encode(digest(raw_code, 'sha256'), 'hex');
$$;

create or replace function public.set_workspace_kiosk_code(
  p_workspace_id uuid, p_kiosk_code text, p_kiosk_enabled boolean
)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.workspace_members
    where workspace_id = p_workspace_id
      and user_id = auth.uid()
      and role in ('tenant_admin','super_admin')
  ) then raise exception 'not authorized'; end if;
  if p_kiosk_code !~ '^[0-9]{6}$' then raise exception 'kiosk code must contain six digits'; end if;
  insert into public.workspace_secrets(workspace_id, kiosk_code_hash)
  values (p_workspace_id, public.hash_kiosk_code(p_kiosk_code))
  on conflict (workspace_id) do update
    set kiosk_code_hash = excluded.kiosk_code_hash, updated_at = now();
  update public.workspaces set kiosk_enabled = p_kiosk_enabled where id = p_workspace_id;
  insert into public.audit_logs(workspace_id, actor_user_id, action, resource_type, metadata)
  values (p_workspace_id, auth.uid(), 'kiosk_settings_updated', 'workspace',
          jsonb_build_object('kiosk_enabled', p_kiosk_enabled));
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.verify_kiosk_access(
  p_workspace_id uuid, p_kiosk_code text, p_device_id uuid
)
returns boolean language sql security definer set search_path = public as $$
  select exists (
    select 1 from public.workspaces w
    join public.workspace_secrets s on s.workspace_id = w.id
    join public.devices d on d.workspace_id = w.id
    where w.id = p_workspace_id
      and w.status = 'active'
      and w.kiosk_enabled
      and exists (
        select 1 from public.workspace_members wm
        where wm.workspace_id = w.id
          and wm.user_id = auth.uid()
          and wm.role in ('tenant_admin','tenant_staff','kiosk_operator','super_admin')
      )
      and s.kiosk_code_hash = public.hash_kiosk_code(p_kiosk_code)
      and d.id = p_device_id
      and d.status = 'active'
  );
$$;

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

drop policy if exists "users read own profile" on public.profiles;
create policy "users read own profile" on public.profiles for select using (id = auth.uid());
drop policy if exists "users update own profile" on public.profiles;
create policy "users update own profile" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "members read workspace" on public.workspaces;
create policy "members read workspace" on public.workspaces for select using (public.is_workspace_member(id));
drop policy if exists "members read workspace members" on public.workspace_members;
create policy "members read workspace members" on public.workspace_members for select using (user_id = auth.uid() or public.is_workspace_member(workspace_id));

drop policy if exists "subscribers read own record" on public.subscribers;
create policy "subscribers read own record" on public.subscribers for select using (user_id = auth.uid());
drop policy if exists "members read subscribers" on public.subscribers;
create policy "members read subscribers" on public.subscribers for select using (public.is_workspace_member(workspace_id));
drop policy if exists "subscribers update own record" on public.subscribers;
create policy "subscribers update own record" on public.subscribers for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "workspace staff create subscribers" on public.subscribers;
create policy "workspace staff create subscribers" on public.subscribers for insert with check (public.is_workspace_member(workspace_id));

drop policy if exists "members read devices" on public.devices;
create policy "members read devices" on public.devices for select using (public.is_workspace_member(workspace_id));
drop policy if exists "admins create devices" on public.devices;
create policy "admins create devices" on public.devices for insert with check (public.is_workspace_member(workspace_id));

drop policy if exists "subscribers read own scans" on public.scans;
create policy "subscribers read own scans" on public.scans for select using (subscriber_id in (select id from public.subscribers where user_id = auth.uid()));
drop policy if exists "members read workspace scans" on public.scans;
create policy "members read workspace scans" on public.scans for select using (public.is_workspace_member(workspace_id));
drop policy if exists "authenticated create scans" on public.scans;
create policy "authenticated create scans" on public.scans for insert with check (auth.uid() is not null);
drop policy if exists "operators update scans" on public.scans;
create policy "operators update scans" on public.scans for update using (operator_user_id = auth.uid() or public.is_workspace_member(workspace_id));

drop policy if exists "subscribers read own results" on public.scan_results;
create policy "subscribers read own results" on public.scan_results for select using (scan_id in (select id from public.scans where subscriber_id in (select id from public.subscribers where user_id = auth.uid())));
drop policy if exists "members read consented results" on public.scan_results;
create policy "members read consented results" on public.scan_results for select using (scan_id in (select s.id from public.scans s join public.subscribers sub on sub.id = s.subscriber_id where public.is_workspace_member(s.workspace_id) and sub.consent_tenant_view_results));
drop policy if exists "scan owner creates results" on public.scan_results;
create policy "scan owner creates results" on public.scan_results for insert with check (scan_id in (select id from public.scans where operator_user_id = auth.uid() or subscriber_id in (select id from public.subscribers where user_id = auth.uid())));

drop policy if exists "subscribers manage own reports" on public.self_reports;
create policy "subscribers manage own reports" on public.self_reports for all using (subscriber_id in (select id from public.subscribers where user_id = auth.uid())) with check (subscriber_id in (select id from public.subscribers where user_id = auth.uid()));
drop policy if exists "members read consented reports" on public.self_reports;
create policy "members read consented reports" on public.self_reports for select using (public.is_workspace_member((select workspace_id from public.subscribers where id = subscriber_id)) and (select consent_tenant_view_results from public.subscribers where id = subscriber_id));