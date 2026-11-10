-- =====================================================================
-- GavIA v2.2 — Neon + better-auth + roles (skill mvp-roles-onboarding).
-- Corre una sola vez (la registra scripts/migrate.mjs en gavia_meta.migrations).
-- Requiere que existan las tablas de better-auth ("user", session, account, verification).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Roles del balneario: 'admin' pasa a llamarse 'staff' (owner | staff).
-- ---------------------------------------------------------------------
alter table public.roles drop constraint if exists roles_code_check;
insert into public.roles (code, name, description) values
  ('staff', 'Staff', 'Staff del balneario. Operación diaria (plano, reservas, clientes y cobros) sin información financiera agregada.')
on conflict (code) do nothing;
insert into public.role_permissions (role_code, permission_code)
  select 'staff', permission_code from public.role_permissions where role_code = 'admin'
on conflict do nothing;
alter table public.memberships drop constraint if exists memberships_role_check;
update public.memberships set role = 'staff' where role = 'admin';
delete from public.role_permissions where role_code = 'admin';
delete from public.roles where code = 'admin';
alter table public.roles add constraint roles_code_check check (code in ('superadmin', 'owner', 'staff'));
alter table public.memberships add constraint memberships_role_check check (role in ('owner', 'staff'));

-- ---------------------------------------------------------------------
-- 2. El balneario es el "cliente" (empresa) de la skill: estado comercial,
--    plan, abono mensual, prueba y día de pago.
-- ---------------------------------------------------------------------
alter table public.balnearios drop constraint if exists balnearios_status_check;
update public.balnearios set status = case status
  when 'prueba' then 'trial' when 'activo' then 'active' when 'suspendido' then 'paused' when 'baja' then 'cancelled' else status end;
alter table public.balnearios alter column status set default 'trial';
alter table public.balnearios add constraint balnearios_status_check
  check (status in ('trial', 'active', 'past_due', 'paused', 'cancelled'));

alter table public.balnearios
  add column if not exists plan_id uuid references public.plans(id) on delete set null,
  add column if not exists monthly_price_cents bigint not null default 0 check (monthly_price_cents >= 0),
  add column if not exists currency text not null default 'USD' check (currency in ('USD', 'ARS')),
  add column if not exists trial_ends_at date,
  add column if not exists billing_day integer check (billing_day between 1 and 28),
  add column if not exists next_due_date date,
  add column if not exists legal_name text not null default '',
  add column if not exists tax_id text not null default '',
  add column if not exists data jsonb not null default '{}'::jsonb;
create index if not exists balnearios_status_idx on public.balnearios (status, next_due_date);

-- El dueño no cambia estado, identificador, plan ni condiciones de cobro: solo el equipo de GavIA.
create or replace function public.guard_balneario() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_superadmin()
     and (new.status is distinct from old.status or new.slug is distinct from old.slug or new.is_demo is distinct from old.is_demo
          or new.plan_id is distinct from old.plan_id or new.monthly_price_cents is distinct from old.monthly_price_cents
          or new.currency is distinct from old.currency or new.trial_ends_at is distinct from old.trial_ends_at
          or new.billing_day is distinct from old.billing_day or new.next_due_date is distinct from old.next_due_date) then
    raise exception 'Solo GavIA puede modificar el estado, el plan o las condiciones de cobro del balneario' using errcode = '42501';
  end if;
  return new;
end $$;

-- Módulos: los del plan asignado al balneario (antes salían de la suscripción anual).
create or replace function public.balneario_modules(p_balneario uuid) returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce((select p.modules from public.balnearios b join public.plans p on p.id = b.plan_id where b.id = p_balneario), '{}'::text[]);
$$;

-- Acceso: estado comercial del balneario. paused / cancelled → panel en solo lectura (lo aplica el servidor).
create or replace function public.balneario_access(p_balneario uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select case
    when not public.is_member(p_balneario) then null
    else (select jsonb_build_object('estado', b.status, 'fin_prueba', case when b.status = 'trial' then b.trial_ends_at end)
            from public.balnearios b where b.id = p_balneario)
  end;
$$;

drop function if exists public.suspend_unrenewed_balnearios();

-- ---------------------------------------------------------------------
-- 3. Planes: abono MENSUAL con período de prueba (skill §4 y §7).
-- ---------------------------------------------------------------------
alter table public.plans add column if not exists trial_days integer not null default 15 check (trial_days between 0 and 365);
update public.plans set billing_period = 'mensual', price_cents = 3990, currency = 'USD' where code = 'start';
update public.plans set billing_period = 'mensual', price_cents = 8990, currency = 'USD' where code = 'pro';
update public.plans set billing_period = 'mensual', price_cents = 12990, currency = 'USD' where code = 'plus';

-- ---------------------------------------------------------------------
-- 4. Puente better-auth → auth.users / profiles (las RLS de la v2.1 usan profiles).
--    Los ids de better-auth son UUID (ver src/lib/auth.ts).
--    Rol de plataforma: user.role 'superadmin' o 'admin' (con email verificado)
--    → profiles.platform_role = 'superadmin' con todas las secciones.
-- ---------------------------------------------------------------------
create or replace function public.sync_auth_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_platform boolean;
  v_all text[] := array['dashboard', 'balnearios', 'crm', 'calendario', 'conversaciones', 'suscripciones',
                        'facturacion', 'reportes', 'usuarios', 'planes', 'auditoria'];
begin
  if tg_op = 'DELETE' then
    delete from auth.users where id = old.id::uuid;
    return old;
  end if;
  if tg_op = 'INSERT' then
    insert into auth.users (id, email, raw_user_meta_data)
    values (new.id::uuid, lower(new.email), jsonb_build_object('full_name', new.name))
    on conflict (id) do nothing;
  else
    update auth.users set email = lower(new.email) where id = new.id::uuid and email is distinct from lower(new.email);
    update public.profiles set email = lower(new.email), full_name = new.name
     where id = new.id::uuid and (email is distinct from lower(new.email) or full_name is distinct from new.name);
  end if;
  v_platform := new.role in ('superadmin', 'admin') and new."emailVerified";
  update public.profiles
     set platform_role = case when v_platform then 'superadmin' end,
         platform_permissions = case when v_platform then v_all else '{}'::text[] end
   where id = new.id::uuid
     and (platform_role is distinct from case when v_platform then 'superadmin' end
          or platform_permissions is distinct from case when v_platform then v_all else '{}'::text[] end);
  return new;
end $$;

drop trigger if exists user_sync on public."user";
create trigger user_sync after insert or update or delete on public."user"
  for each row execute function public.sync_auth_user();

-- Usuarios que ya existieran antes de esta migración.
insert into auth.users (id, email, raw_user_meta_data)
  select u.id::uuid, lower(u.email), jsonb_build_object('full_name', u.name) from public."user" u
  on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 5. Alta de balnearios por link (skill §4-§6): invitaciones, solicitudes,
--    pagos del abono y outbox de mails. Solo los usa el servidor (sin RLS ni grants).
-- ---------------------------------------------------------------------
create table if not exists public.client_invite (
  token text primary key,
  kind text not null check (kind in ('personal', 'campaign')),
  email text,
  label text,
  max_uses integer,
  uses integer not null default 0,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_by text references public."user"(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.client_application (
  id uuid primary key default gen_random_uuid(),
  invite_token text references public.client_invite(token),
  resume_key text not null,
  email text not null,
  contact_name text,
  phone text,
  email_verified_at timestamptz,
  step integer not null default 1,
  data jsonb not null default '{}'::jsonb,
  requested_plan_id uuid references public.plans(id),
  terms_accepted_at timestamptz,
  status text not null default 'draft'
    check (status in ('draft', 'pending_review', 'changes_requested', 'approved', 'rejected')),
  review_reason text,
  reviewed_by text references public."user"(id) on delete set null,
  reviewed_at timestamptz,
  submitted_at timestamptz,
  client_id uuid references public.balnearios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists client_application_status_idx on public.client_application (status, submitted_at);
create index if not exists client_application_token_idx on public.client_application (invite_token);

-- Pagos del abono mensual de cada balneario a GavIA (se registran a mano desde /plataforma).
create table if not exists public.client_payment (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.balnearios(id) on delete cascade,
  period text not null,
  amount_cents bigint not null check (amount_cents >= 0),
  currency text not null default 'USD',
  status text not null default 'pending' check (status in ('pending', 'paid', 'overdue', 'void')),
  method text,
  due_date date not null,
  paid_at timestamptz,
  notes text,
  registered_by text references public."user"(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (client_id, period)
);

create table if not exists public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  to_email text not null,
  subject text not null,
  body_html text not null,
  body_text text,
  template text,
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed', 'outbox_only')),
  error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists email_outbox_created_idx on public.email_outbox (created_at desc);

create index if not exists audit_log_created_idx on public.audit_log (created_at desc);
