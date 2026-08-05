# Arti Enterprise — User Stories
**Last updated: 2026-08-05**

---

## Implemented ✅

### Teacher

- As a teacher, I want to sign in with my email so that I can access my school portal.
- As a teacher, I want to see all my classes so that I can manage them in one place.
- As a teacher, I want to create a new class with a name and grade so that I can organise my pupils.
- As a teacher, I want to rename a class so that I can keep my class list accurate.
- As a teacher, I want to archive a class so that it is hidden without being permanently deleted.
- As a teacher, I want to add a pupil to a class with a name and communication goal so that I can build their profile.
- As a teacher, I want to rename a pupil or update their communication goal so that their profile stays current.
- As a teacher, I want to archive a pupil so that they are hidden from active lists without losing their data.
- As a teacher, I want to move a pupil to a different class so that I can reflect changes in their placement.
- As a teacher, I want to link a parent email to a pupil so that the parent can access that pupil's dashboard.
- As a teacher, I want to remove a parent email from a pupil so that access can be revoked when needed.
- As a teacher, I want to open a pupil's communication dashboard from their profile so that I can support them directly.

### Parent

- As a parent, I want to sign in with my email so that I can access my child's dashboard.
- As a parent with one child, I want to be taken directly to my child's dashboard so that I do not have to navigate through extra steps.
- As a parent with multiple children, I want to see a list of my children so that I can choose which dashboard to open.
- As a parent, I want to open my child's communication dashboard so that I can support them at home.

### General

- As a user, I want the portal to fall back to pilot directory data if the API is unavailable so that I can still access the system during outages.

---

## Not Yet Built ❌

### Teacher

- As a teacher, I want to view a pupil's personal dashboard in view-only mode so that I can understand their home communication setup without being able to edit it.
- As a teacher, I want to switch between a pupil's school dashboard and personal dashboard so that I can compare both contexts.
- As a teacher, I want to see a clear indicator that I am in view-only mode so that I do not accidentally expect edit access.
- As a teacher, I want to navigate to a specific class page via a dedicated URL so that I can bookmark or share it.
- As a teacher, I want to navigate to a specific pupil page via a dedicated URL so that I can return to it quickly.

### Parent

- As a parent, I want to edit my child's personal dashboard so that I can customise it for use at home.
- As a parent, I want to view my child's school dashboard in view-only mode so that I can see what tiles they use at school.
- As a parent, I want to switch between my child's personal and school dashboard so that I can compare both.
- As a parent, I want to see a clear indicator that I am in view-only mode on the school dashboard so that I understand I cannot edit it.

### Institution Admin

- As an institution admin, I want to create teacher accounts so that staff can access the portal without me manually seeding the database.
- As an institution admin, I want to create parent accounts so that families can be onboarded through the portal.
- As an institution admin, I want to create and manage classes so that the school structure is reflected in the system.
- As an institution admin, I want to assign pupils to classes so that teachers see the right cohort.
- As an institution admin, I want to assign staff to classes so that the right teachers have access to the right pupils.
- As an institution admin, I want to edit school dashboards so that I can manage shared communication resources.
- As an institution admin, I want personal dashboards to be private by default so that pupil home data is protected.

### All Authenticated Users

- As a user, I want to be redirected to a login page when I am not authenticated so that access is always protected.
- As a user, I want to be redirected to the correct area after login based on my role so that I land in the right place immediately.

### Dashboard

- As any authorised user, I want to open a pupil's dashboard and see both Personal Arti and School Arti as switchable options so that I always know both boards exist.
- As any authorised user, I want the active dashboard scope to be clearly labelled so that I know whether I am viewing the personal or school board.
- As any authorised user in view-only mode, I want tile editing, admin access, export, and restore to be hidden or disabled so that I cannot accidentally change a dashboard I do not own.
