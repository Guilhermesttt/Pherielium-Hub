-- Corrige o erro 42P10 ("there is no unique or exclusion constraint matching
-- the ON CONFLICT specification") nos upserts de user_games (onConflict user_id,id)
-- e public_profiles (onConflict uid).
--
-- Contexto: o app faz upsert(chunk, { onConflict: "user_id,id" }) em user_games.
-- O PostgREST/Postgres so aceita ON CONFLICT (colunas) quando existe uma
-- UNIQUE CONSTRAINT (ou indice unico valido para inferencia) com exatamente
-- essas colunas. Em bancos criados antes da migration 20260729193000 — ou onde
-- ela nao foi aplicada — esse indice nao existe e todo sync retorna 400.
-- Esta migration e idempotente e pode ser aplicada com `supabase db push`.

begin;

-- 1) Garante PK em public_profiles(uid) para o upsert onConflict "uid".
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.public_profiles'::regclass and contype = 'p'
  ) then
    alter table public.public_profiles add primary key (uid);
  end if;
end
$$;

-- 2) Garante UNIQUE CONSTRAINT (user_id, id) em user_games.
--    Primeiro remove duplicatas eventuais (mantem a linha mais recente),
--    depois cria a constraint e o indice de apoio.
do $$
begin
  -- Dedupe defensivo: mantem apenas updated_at mais recente por (user_id, id).
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'user_games'
  ) then
    delete from public.user_games a
    using public.user_games b
    where a.ctid < b.ctid
      and a.user_id = b.user_id
      and a.id = b.id;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'user_games_user_id_id_key'
  ) then
    alter table public.user_games
      add constraint user_games_user_id_id_key unique (user_id, id);
  end if;
end
$$;

-- Indice de apoio (se a constraint acima ja criou um indice unico equivalente,
-- este create e no-op por causa do IF NOT EXISTS com nome distinto).
create unique index if not exists user_games_user_id_id_unique
  on public.user_games (user_id, id);

commit;
