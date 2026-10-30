# Skydiver Monitor

Real-time skydiver monitoring for instructors and jump teams. The system combines a BLE wearable, an offline-first Expo mobile app, Supabase persistence, and a responsive Next.js dashboard with safety analytics.

> **Project status:** active prototype / pilot software. Do not use the current deployment as the sole source of safety-critical decisions. Validate the wearable, alert thresholds, connectivity behavior, and operational procedures before production or field use.

## What it does

- Streams wearable telemetry over Bluetooth Low Energy.
- Collects phone GPS and derives altitude and vertical speed.
- Stores telemetry locally in SQLite and retries synchronization when connectivity returns.
- Persists sessions, telemetry, and alerts in Supabase.
- Shows live skydiver status, vitals, location, jump phase, and alert history in the web dashboard.
- Provides local AI safety analysis with optional Gemini comparison.
- Supports mock data mode for demos and UI testing.

## Architecture

```text
BLE wearable
    │ FAST / SLOW packets
    ▼
Expo mobile app ── SQLite queue ── Supabase
    │ GPS                         │ Realtime
    └─────────────────────────────▼
                              Next.js dashboard
```

| Area | Directory | Responsibility |
| --- | --- | --- |
| Web dashboard | `web/` | Live monitoring, maps, alerts, analytics, and AI route |
| Mobile app | `mobile/` | BLE connection, GPS, recording, offline queue, sync |
| Shared contracts | `packages/shared/` | Types and database DTOs shared by web and mobile |
| Database | `supabase/migrations/` | Schema, views, functions, RLS, and Realtime |
| Build orchestration | `scripts/build-all.sh` | Web and Android/EAS builds |
| Hardware design | `Kicad-schema/` | KiCad schematic and PCB files |

The wearable firmware is not included in this repository. The mobile BLE protocol expects the service and characteristic UUIDs documented in `DOCUMENTATIE_RO.md`.

## Prerequisites

- Node.js 20 or newer
- npm
- A Supabase project
- For mobile development: Expo tooling, a device or emulator, and the platform SDK
- For local Android release builds: Android SDK and Gradle-compatible Java
- For EAS builds: `eas-cli` and an authenticated Expo account

## Quick start

Clone the repository and install dependencies for each runnable application:

```bash
git clone https://github.com/RobuGabrie/skydiver.git
cd skydiver

npm install --prefix web
npm install --prefix mobile
```

Configure Supabase before starting either app.

### Web environment

Create `web/.env.local`:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-public-anon-key

# Optional: enables Gemini comparison in /api/ai/gemini
GEMINI_API_KEY=your-server-side-gemini-key
# Optional; the route has a default model
GEMINI_MODEL=your-model-name
```

Only the `NEXT_PUBLIC_*` values are exposed to the browser. Never put a service-role key or other secret in a `NEXT_PUBLIC_*` variable.

Start the dashboard:

```bash
cd web
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Mobile configuration

The mobile app reads Supabase credentials from `expo.extra` in `mobile/app.json`:

```json
{
  "expo": {
    "extra": {
      "supabaseUrl": "https://YOUR_PROJECT.supabase.co",
      "supabaseAnonKey": "your-public-anon-key"
    }
  }
}
```

Start Expo:

```bash
cd mobile
npm start
```

Use a development build or a physical device for BLE testing. Browser and simulator environments do not provide equivalent BLE behavior.

## Supabase setup

Apply migrations in filename order using the Supabase SQL editor. If the Supabase CLI is configured for this project, link the project and push the migrations:

```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

If using the SQL editor, run:

```text
supabase/migrations/001_schema.sql
supabase/migrations/002_fix_parachute_detection.sql
supabase/migrations/002_rls.sql
supabase/migrations/003_fix_sessions.sql
```

The migrations create:

- `devices`, `sessions`, `telemetry_events`, and `alert_events`
- `skydiver_profiles` and `ai_jobs`
- `current_skydivers` for the dashboard's initial state
- `upsert_device_and_session` for idempotent mobile session bootstrap
- Row Level Security policies and Realtime publication configuration

After connecting a wearable, populate `skydiver_profiles` if you want stable display names and avatars in the dashboard.

## Development commands

From the repository root:

```bash
npm run build:web       # Production Next.js build
npm run build:mobile    # Local Android release APK
npm run build           # Web build followed by local Android build
npm run build:mobile:eas       # EAS Android preview build
npm run build:mobile:eas-prod  # EAS Android production build
```

Application-specific commands:

```bash
cd web
npm run lint
npm run build
npm start
```

```bash
cd mobile
npm start
npm run android
npm run ios
npm run web
```

The local mobile build expects `mobile/android/` to exist. Generate native projects once when needed:

```bash
cd mobile
npx expo prebuild
```

The build script writes a local release APK to `dist/skydiver-mobile-release.apk`. Set `SKIP_INSTALL=1` when dependencies are already installed.

## Data flow and reliability

1. The wearable publishes fast motion packets and slower vitals/status packets.
2. The mobile app decodes packets and combines them with phone location.
3. Events are written to a SQLite queue before upload.
4. Uploads use UUID event IDs and app-level monotonic sequences for idempotency.
5. Failed uploads remain queued and are retried.
6. The dashboard loads `current_skydivers`, then subscribes to Realtime changes.
7. A skydiver is marked offline when updates exceed the dashboard inactivity threshold.

Alert types currently include abnormal pulse, low oxygen, high stress, low battery, uncontrolled fall, and excessive rotation. Alert cooldowns prevent repeated notifications for the same condition.

## Deployment

### Web on Vercel

The repository includes `vercel.json` configured for the `web/` Next.js application. Configure the following Vercel environment variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `GEMINI_API_KEY` (optional)
- `GEMINI_MODEL` (optional)

Build and run locally in production mode:

```bash
cd web
npm run build
npm start
```

### Mobile with EAS

```bash
cd mobile
npx eas login
npx eas build --platform android --profile preview
npx eas build --platform android --profile production
```

The EAS profiles are defined in `mobile/eas.json`. Production builds use remote version management and automatic version increments.

## Security and operations

The included RLS policies are designed for the current anonymous prototype flow: the public anon role can read telemetry and insert events, while the dashboard can acknowledge alerts. Before a production launch, add authenticated users, restrict rows by team/device ownership, protect profile administration, rotate exposed credentials, and review Realtime access.

For field operation, test at minimum:

- BLE disconnect and reconnect during a jump
- Offline recording and later synchronization
- Duplicate event retry behavior
- GPS permission denial and poor location accuracy
- Stale sessions and device replacement
- Alert acknowledgment permissions
- Database backups, retention, and monitoring

## Repository notes

- `DOCUMENTATIE_RO.md` contains the detailed Romanian architecture and BLE protocol notes.
- `dist/` may contain a locally generated APK; release artifacts should be produced by CI or EAS.
- Do not commit `.env.local`, private API keys, service-role keys, signing credentials, or device secrets.

## License

No open-source license is currently declared. Treat the repository as proprietary unless the project owners provide written permission otherwise.
