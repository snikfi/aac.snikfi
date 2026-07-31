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

create policy "deny_anon_access"
on public.tile_config
for all
using (false)
with check (false);
