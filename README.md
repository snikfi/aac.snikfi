# Arti AAC App

Arti is a React + Vite communication board that supports:

- Subject, verb, and object tile selection
- Speech playback
- Admin tile management (add/edit/reorder/delete)
- Cross-device tile persistence through a sync API

Arti now also includes an isolated enterprise pilot portal route with role-based flows for teachers and parents.

## Project Structure

- `src/`: Frontend app
- `server/`: Sync API service (Express + Supabase)

## Local Development

1. Install frontend dependencies:

```bash
npm install
```

2. Install sync API dependencies:

```bash
cd server
npm install
```

3. Start API server:

```bash
npm start
```

Before running the API, configure Supabase once:

1. Create a Supabase project.
2. In Supabase SQL Editor, run the SQL in `server/supabase.sql`.
3. In Supabase project settings, copy:
- Project URL
- Service role key

4. In the project root, create `.env` with:

```bash
VITE_ARTI_SYNC_URL=http://localhost:8787
```

5. In `server/.env`, set secure admin auth values:

```bash
ARTI_ADMIN_PIN=replace-with-long-random-pin
ARTI_ADMIN_SESSION_SECRET=replace-with-long-random-secret
ARTI_ADMIN_SESSION_TTL_HOURS=12
ARTI_ADMIN_MAX_ATTEMPTS=5
ARTI_ADMIN_LOCKOUT_MINUTES=15
```

5. In another terminal, start frontend:

```bash
npm run dev
```

## Production Setup (Single User)

Deploy two services:

1. Frontend (Vite build output)
2. Sync API (`server/index.js`) connected to Supabase

Required API environment variables:

- `PORT`: API port (default `8787`)
- `ARTI_ADMIN_PIN`: server-side PIN used to unlock admin actions
- `ARTI_ADMIN_SESSION_SECRET`: secret used to sign admin session tokens
- `ARTI_ADMIN_SESSION_TTL_HOURS`: optional admin token lifetime in hours (default `12`)
- `ARTI_ADMIN_MAX_ATTEMPTS`: optional failed PIN attempts allowed before lockout (default `5`)
- `ARTI_ADMIN_LOCKOUT_MINUTES`: optional lockout length after too many failed attempts (default `15`)
- `CORS_ORIGIN`: frontend origin (for example `https://arti.example.com`)
- `SUPABASE_URL`: Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase service role key
- `SUPABASE_TILE_TABLE`: optional table name (default `tile_config`)

Required frontend environment variables:

- `VITE_ARTI_SYNC_URL`: public URL of sync API

## How Cross-Device Persistence Works

- App still caches tile config in browser localStorage for fast startup.
- On launch, app fetches cloud config from sync API.
- Any tile change is saved to localStorage and then pushed to sync API.
- Opening the same app URL on another device loads the same shared config.

## Enterprise Pilot Portal

- Route: `/enterprise`
- Purpose: Keep teacher/parent portal development isolated from the original AAC dashboard.
- Teacher flow: Sign in -> class list -> pupil list -> pupil profile dashboard.
- Parent flow:
	- Single child: direct child communication dashboard.
	- Multiple children: child selection page before dashboard.

Pilot sign-in accounts used by the enterprise route:

- Teacher: `ava@springfield.edu`
- Parent with multiple children: `mia.harris@example.com`
- Parent with one child: `oscar.cole@example.com`

Note: These are local pilot directory accounts in frontend code only and are not production authentication.

Enterprise roster lookup also supports API-backed data:

- Endpoint: `POST /api/enterprise/lookup`
- Request: `{ "role": "teacher" | "parent", "email": "user@example.com" }`
- Response: role profile payload consumed by the enterprise portal UI.

Teacher management endpoints:

- `POST /api/enterprise/classes`
- `PATCH /api/enterprise/classes/:classId`
- `POST /api/enterprise/classes/:classId/archive`
- `POST /api/enterprise/pupils`
- `PATCH /api/enterprise/pupils/:pupilId`
- `POST /api/enterprise/pupils/:pupilId/archive`
- `POST /api/enterprise/pupils/:pupilId/reassign`
- `POST /api/enterprise/pupils/:pupilId/parents`
- `POST /api/enterprise/pupils/:pupilId/parents/remove`

These return the updated teacher profile payload so the enterprise UI can refresh class and pupil lists immediately.

To enable Supabase-backed roster data, re-run `server/supabase.sql` in your enterprise Supabase project. The SQL now creates enterprise user, class, pupil, and parent-child tables and seeds pilot data.

## Security Notes

- Admin unlock verification happens on the server and returns a short-lived session token.
- Repeated failed PIN attempts trigger a temporary server-side lockout.
- Use HTTPS in production.
- Keep `ARTI_ADMIN_PIN` and `ARTI_ADMIN_SESSION_SECRET` long and random.
- Restrict `CORS_ORIGIN` to your app domain.
- Never expose `SUPABASE_SERVICE_ROLE_KEY` in frontend code.
- Protect the API deployment with network controls if possible.
