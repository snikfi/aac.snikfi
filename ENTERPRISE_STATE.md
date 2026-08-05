# Arti Enterprise — Project State Document
**Last updated: 2026-08-05**

---

## Project Overview

Arti is a React + Vite AAC (Augmentative and Alternative Communication) app.
It has two layers:

1. **Main dashboard** (`/`) — single-user communication board with tile management, cloud sync, admin PIN protection. Lives on `main` git branch.
2. **Enterprise portal** (`/enterprise`) — role-based school and family portal. Lives on `enterprise` git branch.

Both layers share the same codebase and repo but are isolated by route and git branch.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React + Vite |
| Backend API | Express (Node.js) |
| Database | Supabase (Postgres) |
| Frontend deploy | Netlify |
| API deploy | Render |
| Local API port | 8787 |
| Local frontend port | 5175 (fixed via vite.config.js strictPort) |

---

## Repo Structure

```
/
├── src/
│   ├── App.jsx                         # Main dashboard
│   ├── main.jsx                        # Route split: /enterprise vs /
│   ├── enterprise/
│   │   ├── EnterpriseApp.jsx           # Enterprise portal UI
│   │   ├── EnterpriseApp.css           # Enterprise styles
│   │   └── mockDirectory.js            # Fallback pilot data
│   └── lib/
│       ├── tileConfigSync.js           # Main dashboard cloud sync
│       └── enterpriseDirectorySync.js  # Enterprise API client
├── server/
│   ├── index.js                        # Express API (tile sync + enterprise)
│   ├── supabase.sql                    # Full DB schema + seed data
│   ├── package.json
│   ├── .env                            # Active server env (not committed)
│   ├── .env.enterprise                 # Server env profile for enterprise branch
│   ├── .env.main                       # Server env profile for main branch
│   └── .env.example
├── scripts/
│   └── use-env.mjs                     # Branch env switch script
├── .env.local                          # Active frontend env (not committed)
├── .env.local.enterprise               # Frontend env profile for enterprise branch
├── .env.local.main                     # Frontend env profile for main branch
├── vite.config.js                      # Fixed port 5175
└── public/
    └── _redirects                      # Netlify SPA fallback
```

---

## Branch-Safe Env Workflow

After switching git branches, always run the matching command:

```bash
npm run env:main         # switches to main Supabase + env
npm run env:enterprise   # switches to enterprise Supabase + env
```

Then restart both servers:

```bash
npm --prefix server start   # API
npm run dev                 # Frontend
```

Profile files (local only, never committed):
- `.env.local.main` / `.env.local.enterprise`
- `server/.env.main` / `server/.env.enterprise`

---

## Supabase Projects

| Branch | Project ref | Purpose |
|---|---|---|
| main | original project | Tile config for main dashboard |
| enterprise | avzbirqrcnjppullkhoq | Enterprise users, classes, pupils |

---

## Pilot Accounts (enterprise branch, fallback + DB seeded)

| Role | Email |
|---|---|
| Teacher | ava@springfield.edu |
| Parent (multi-child) | mia.harris@example.com |
| Parent (single child) | oscar.cole@example.com |

---

## What Is Built

### Enterprise Portal
- `/enterprise` route isolated from main dashboard
- Role toggle sign-in: teacher / parent
- API-backed profile lookup with fallback to mock directory
- Teacher portal:
  - Class CRUD (create, rename, archive)
  - Pupil CRUD (create, rename, archive)
  - Soft archive (archived items hidden from lists)
  - Link/unlink parent emails to pupils
  - Reassign/move pupil between classes
- Parent portal:
  - Single-child: direct dashboard entry
  - Multi-child: child selection page first
- Per-pupil launch link to main dashboard with context query params:
  - `pupilId`, `pupilName`, `goal`, `className`, `teacherName`, `viewerRole`, `viewerName`

### API Endpoints (server/index.js)
- `POST /api/enterprise/lookup`
- `POST /api/enterprise/classes`
- `PATCH /api/enterprise/classes/:classId`
- `POST /api/enterprise/classes/:classId/archive`
- `POST /api/enterprise/pupils`
- `PATCH /api/enterprise/pupils/:pupilId`
- `POST /api/enterprise/pupils/:pupilId/archive`
- `POST /api/enterprise/pupils/:pupilId/reassign`
- `POST /api/enterprise/pupils/:pupilId/parents`
- `POST /api/enterprise/pupils/:pupilId/parents/remove`

### DB Tables (server/supabase.sql)
- `tile_config` — main dashboard tiles
- `enterprise_users` — role, email, full_name
- `enterprise_classes` — teacher, name, grade, archived
- `enterprise_pupils` — class, name, goal, archived
- `enterprise_parent_child` — parent_user_id, pupil_id

### Main Dashboard (main branch)
- Tile management (subjects, verbs, objects)
- 3-step and free communication modes
- Cloud sync via Supabase
- Admin panel with PIN protection (server-side, rate-limited)
- Quick tiles (side rail)
- Export/import backup
- Speech playback
- Mobile responsive

---

## What Is NOT Yet Built (Agreed Scope)

### 1. Proper Route Model
Agreed routes not yet implemented:

```
/login
/parent
/parent/children
/teacher
/teacher/classes/:classId
/teacher/pupils/:pupilId
/dashboard/:pupilId/:scope        scope = personal | school
```

Currently using an email form inside `/enterprise` instead of a real `/login` route.

### 2. Dual-Scope Dashboard (highest priority unbuilt item)
Each pupil should have two dashboards:
- `personal` — owned by parent, editable by parent, view-only for teacher
- `school` — owned by school, editable by teacher, view-only for parent

Currently every pupil launch opens the single shared main dashboard with no scope awareness.

DB shape needed:

```
Dashboard { id, pupilId, scope, tileConfig, updatedAt, updatedByUserId }
```

One record per pupil per scope.

### 3. Dashboard Switcher UI
Inside the dashboard, a switcher to move between:
- Personal Arti
- School Arti (View only) — label changes based on access mode

| Who | Personal | School |
|---|---|---|
| Parent | edit | view |
| Teacher | view | edit |

### 4. View-Only Access Mode
- Dashboard fully usable for communication
- Admin/tile editing unavailable
- Export/restore unavailable
- Clear visual "View only" indicator in UI
- Admin PIN not accessible

### 5. Institution Admin Role
- Manages staff accounts
- Manages parent accounts
- Manages classes and pupil assignments
- Can edit school dashboards
- Should NOT view personal dashboards by default

### 6. Full Data Model (not yet in DB)
Missing entities from agreed blueprint:

```
Institution       { id, name, slug, createdAt }

StaffMembership   { id, userId, institutionId, staffRole }
                    staffRole: teacher | support_staff | therapist | institution_admin

DashboardPermission { id, dashboardId, userId, accessMode }
                      accessMode: view | edit
```

Note: agreed to use `staff` in the data model even if UI says "Teacher", to avoid renaming later when other staff types are added.

### 7. Proper Login Page (/login)
Currently sign-in is an email form embedded in `/enterprise`.
Agreed to build a proper `/login` route that:
- unauthenticated users always land on
- resolves role and redirects accordingly

### 8. Templates (deferred, design only)
Leave room in the model for:

```
Template { id, institutionId, scope, name, tileConfig }
```

Not required to build yet. Do not over-design.

---

## Agreed Permission Rules

| Role | Personal dashboard | School dashboard |
|---|---|---|
| Parent | edit | view |
| Teacher/staff | view | edit |
| Institution admin | no (default) | edit |
| Pupil | no account | no account |

---

## Recommended Build Order (agreed)

1. App shell and route structure (no real auth yet, mocked session)
2. Extract dashboard into a scoped screen (pupil-aware, scope-aware, access-aware)
3. Mock user/session model for: parent with 1 child, parent with 2 children, teacher with classes and pupils
4. Parent resolver flow (1 child direct, multi-child selection)
5. Teacher home (classes -> pupils)
6. Pupil access flow (school edit, personal view)
7. Dashboard switcher + view-only mode
8. Institution admin (last, not required immediately)

---

## Important Design Decisions (locked)

- Dashboard switcher should always show both options when user has access to both
- "This pupil has two Arti boards" is the mental model
- Pupil has no authenticated login
- Personal dashboard = parent-owned
- School dashboard = institution-owned
- Use `staff` in data model, `Teacher` in UI labels
- Templates exist conceptually, scope/ownership defined later
- Admin PIN protects edit mode, not view mode
