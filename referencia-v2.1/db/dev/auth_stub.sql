-- =====================================================================
-- SOLO DESARROLLO LOCAL (PGlite). No ejecutar en Supabase.
-- Emula el esquema `auth` y los roles que Supabase provee, para que las
-- migraciones y las políticas RLS se ejecuten sin cambios en local.
-- =====================================================================
create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  encrypted_password text not null,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Misma semántica que auth.uid() de Supabase: lee el "sub" de request.jwt.claims.
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid;
$$;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;

grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated;
