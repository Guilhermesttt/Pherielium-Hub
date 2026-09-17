create table if not exists public.steam_store_cache (
  app_id text not null,
  locale text not null default 'en',
  payload jsonb not null,
  fetched_at timestamptz not null default now(),
  primary key (app_id, locale)
);

create index if not exists steam_store_cache_fetched_at_idx
  on public.steam_store_cache (fetched_at);

alter table public.steam_store_cache enable row level security;

-- no policies for authenticated/anon — service_role only
revoke all on public.steam_store_cache from anon, authenticated;
grant all on public.steam_store_cache to service_role;
