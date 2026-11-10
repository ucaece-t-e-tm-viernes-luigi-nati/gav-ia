-- =====================================================================
-- GavIA v2.2 — Compatibilidad del esquema de la v2.1 con Neon (sin Supabase).
-- Idempotente: corre en cada `node scripts/migrate.mjs`, ANTES de las migraciones.
--
-- Las migraciones de la v2.1 usan auth.uid(), auth.users y el rol `authenticated`
-- (lo que provee Supabase). Acá se emulan en Postgres puro:
--   - auth.users es un espejo de la tabla "user" de better-auth (lo mantiene un trigger,
--     ver la migración 20261110000007_v22_neon.sql). No guarda contraseñas.
--   - auth.uid() lee el "sub" de request.jwt.claims, que el servidor fija en cada
--     transacción de usuario (src/server/db/postgres-driver.ts) junto con
--     `set local role authenticated`. Así las políticas RLS se aplican igual que en la v2.1.
-- =====================================================================
create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key,
  email text not null unique,
  encrypted_password text not null default '',
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid;
$$;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;

-- El usuario de la conexión tiene que poder hacer `set local role authenticated`.
-- En Postgres 16+ (Neon) quien crea el rol queda como miembro con ADMIN pero SIN la opción SET:
-- por eso se chequea el privilegio SET (no MEMBER) y se otorga explícitamente con SET TRUE.
do $$ begin
  if not pg_has_role(current_user, 'authenticated', 'SET') then
    if current_setting('server_version_num')::int >= 160000 then
      execute format('grant authenticated to %I with set true, inherit false', current_user);
    else
      execute format('grant authenticated to %I', current_user);
    end if;
  end if;
end $$;

grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated;
