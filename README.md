# Arti AAC App

Arti is a React + Vite communication board that supports:

- Subject, verb, and object tile selection
- Speech playback
- Admin tile management (add/edit/reorder/delete)
- Cross-device tile persistence through a sync API

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
VITE_ARTI_SYNC_TOKEN=replace-with-strong-token
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
- `ARTI_SYNC_TOKEN`: shared token required for writes
- `CORS_ORIGIN`: frontend origin (for example `https://arti.example.com`)
- `SUPABASE_URL`: Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase service role key
- `SUPABASE_TILE_TABLE`: optional table name (default `tile_config`)

Required frontend environment variables:

- `VITE_ARTI_SYNC_URL`: public URL of sync API
- `VITE_ARTI_SYNC_TOKEN`: same token as API

## How Cross-Device Persistence Works

- App still caches tile config in browser localStorage for fast startup.
- On launch, app fetches cloud config from sync API.
- Any tile change is saved to localStorage and then pushed to sync API.
- Opening the same app URL on another device loads the same shared config.

## Security Notes

- This setup is intentionally scoped to one user and uses a shared token.
- Use HTTPS in production.
- Keep the token long and random.
- Restrict `CORS_ORIGIN` to your app domain.
- Never expose `SUPABASE_SERVICE_ROLE_KEY` in frontend code.
- Protect the API deployment with network controls if possible.
