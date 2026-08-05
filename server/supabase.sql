create table if not exists public.tile_config (
  id bigint primary key,
  config jsonb not null,
  updated_at timestamptz not null default now()
);

-- Seed the singleton row used by the API (id = 1).
insert into public.tile_config (id, config, updated_at)
values (
  1,
  '{"subjects": [], "verbs": [], "objectsByVerb": {}}'::jsonb,
  now()
)
on conflict (id) do nothing;

-- Enable RLS for safety. The backend uses service role key so it can still read/write.
alter table public.tile_config enable row level security;

drop policy if exists "deny_anon_access" on public.tile_config;
create policy "deny_anon_access"
on public.tile_config
for all
using (false)
with check (false);

create table if not exists public.enterprise_users (
  id text primary key,
  role text not null check (role in ('teacher', 'parent')),
  email text not null unique,
  full_name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.enterprise_classes (
  id text primary key,
  teacher_user_id text not null references public.enterprise_users(id) on delete cascade,
  name text not null,
  grade text not null,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.enterprise_pupils (
  id text primary key,
  class_id text not null references public.enterprise_classes(id) on delete cascade,
  name text not null,
  communication_goal text not null,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.enterprise_classes
  add column if not exists archived_at timestamptz;

alter table public.enterprise_pupils
  add column if not exists archived_at timestamptz;

create table if not exists public.enterprise_parent_child (
  parent_user_id text not null references public.enterprise_users(id) on delete cascade,
  pupil_id text not null references public.enterprise_pupils(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (parent_user_id, pupil_id)
);

insert into public.enterprise_users (id, role, email, full_name)
values
  ('teacher-ava', 'teacher', 'ava@springfield.edu', 'Ava Bennett'),
  ('parent-mia', 'parent', 'mia.harris@example.com', 'Mia Harris'),
  ('parent-oscar', 'parent', 'oscar.cole@example.com', 'Oscar Cole')
on conflict (id) do update set
  role = excluded.role,
  email = excluded.email,
  full_name = excluded.full_name;

insert into public.enterprise_classes (id, teacher_user_id, name, grade)
values
  ('class-oak', 'teacher-ava', 'Oak Room', 'Year 2'),
  ('class-maple', 'teacher-ava', 'Maple Room', 'Year 3')
on conflict (id) do update set
  teacher_user_id = excluded.teacher_user_id,
  name = excluded.name,
  grade = excluded.grade;

insert into public.enterprise_pupils (id, class_id, name, communication_goal)
values
  ('pupil-luca', 'class-oak', 'Luca Harris', 'Expanding two-step requests'),
  ('pupil-ella', 'class-oak', 'Ella Foster', 'Daily routine vocabulary'),
  ('pupil-zara', 'class-maple', 'Zara Cole', 'Pronoun and social scripts')
on conflict (id) do update set
  class_id = excluded.class_id,
  name = excluded.name,
  communication_goal = excluded.communication_goal;

insert into public.enterprise_parent_child (parent_user_id, pupil_id)
values
  ('parent-mia', 'pupil-luca'),
  ('parent-mia', 'pupil-ella'),
  ('parent-oscar', 'pupil-zara')
on conflict (parent_user_id, pupil_id) do nothing;

alter table public.enterprise_users enable row level security;
alter table public.enterprise_classes enable row level security;
alter table public.enterprise_pupils enable row level security;
alter table public.enterprise_parent_child enable row level security;

drop policy if exists "deny_anon_enterprise_users" on public.enterprise_users;
create policy "deny_anon_enterprise_users"
on public.enterprise_users
for all
using (false)
with check (false);

drop policy if exists "deny_anon_enterprise_classes" on public.enterprise_classes;
create policy "deny_anon_enterprise_classes"
on public.enterprise_classes
for all
using (false)
with check (false);

drop policy if exists "deny_anon_enterprise_pupils" on public.enterprise_pupils;
create policy "deny_anon_enterprise_pupils"
on public.enterprise_pupils
for all
using (false)
with check (false);

drop policy if exists "deny_anon_enterprise_parent_child" on public.enterprise_parent_child;
create policy "deny_anon_enterprise_parent_child"
on public.enterprise_parent_child
for all
using (false)
with check (false);
