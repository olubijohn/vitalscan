# PreCURE Supabase handoff bundle

This folder is a portable React + Vite application for moving PreCURE to another platform with Supabase as the database and authentication provider.

## Included files

- `VitalScanSupabase.jsx` — complete single-file React application
- `main.jsx` — Vite entry point
- `index.html` — browser document
- `vite.config.js` — Vite configuration
- `.env.example` — required public Supabase variables
- `supabase/migrations/001_vitalscan.sql` — schema, indexes, helper functions, RLS, and secure RPCs
- `supabase/seed.sql` — optional development seed data
- `VitalScan-Supabase-Migration-Guide.md` — detailed migration and launch instructions

## Run locally

```bash
npm install
cp .env.example .env.local
# Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local
npm run dev
```

## Configure Supabase

1. Create a Supabase project.
2. Open SQL Editor.
3. Run `supabase/migrations/001_vitalscan.sql`.
4. For a development project only, run `supabase/seed.sql`.
5. Enable Email/Password under Authentication → Providers.
6. Start the app and register a subscriber account.
7. Use a trusted server-side script to create a workspace, workspace member, device, and tenant administrator.

The migration enables RLS. The browser uses only the anon key. Never expose the service-role key.

## Build for deployment

```bash
npm run build
npm run preview
```

Deploy the generated `dist/` directory to Vercel, Netlify, Cloudflare Pages, Render static hosting, or any static web host. Add the two `VITE_` variables to that platform’s environment settings.

## Clinical SDK

The application expects the licensed FaceHeart/FHVitals integration to provide:

```js
window.FHVitals.measure({ subscriberId })
```

Replace that adapter boundary with the exact vendor SDK API. The app intentionally shows an error and aborts the scan when the SDK is unavailable; it does not silently generate clinical readings.

## Production warning

Before accepting real health data, implement the atomic credit-consumption RPC described in the guide, use a trusted Edge Function for kiosk authentication, confirm the vendor SDK license and data-processing terms, review privacy/legal requirements, configure backups and retention, and run a security review.