-- =====================================================================
-- GAVIA ERP — Esquema inicial
-- Compatible con Supabase (PostgreSQL 15+). Usa auth.uid() y auth.users.
-- Aislamiento multi-balneario mediante Row Level Security.
-- Importes monetarios: bigint en centavos (sin errores de punto flotante).
-- =====================================================================

create extension if not exists btree_gist;

-- ---------------------------------------------------------------------
-- Catálogos: roles y permisos
-- ---------------------------------------------------------------------
create table public.roles (
  code text primary key check (code in ('superadmin', 'owner', 'admin')),
  name text not null,
  description text not null
);

create table public.permissions (
  code text primary key,
  description text not null
);

create table public.role_permissions (
  role_code text not null references public.roles(code) on delete cascade,
  permission_code text not null references public.permissions(code) on delete cascade,
  primary key (role_code, permission_code)
);

insert into public.roles (code, name, description) values
  ('superadmin', 'Superadmin GAVIA', 'Equipo interno de GAVIA. Gestiona todos los balnearios.'),
  ('owner', 'Dueño', 'Dueño del balneario. Gestión operativa y financiera completa de su establecimiento.'),
  ('admin', 'Administrador', 'Administrador del balneario. Gestión operativa sin información financiera agregada.');

insert into public.permissions (code, description) values
  ('plano.ver', 'Ver el plano y la disponibilidad'),
  ('plano.configurar', 'Configurar sectores y unidades'),
  ('reservas.gestionar', 'Crear y modificar reservas'),
  ('clientes.gestionar', 'Crear y modificar clientes'),
  ('clientes.datos_sensibles', 'Ver documento y domicilio de clientes'),
  ('cobros.registrar', 'Registrar cobros de reservas'),
  ('cobros.anular', 'Anular o corregir cobros'),
  ('finanzas.ver', 'Ver facturación, ingresos y reportes financieros'),
  ('usuarios.gestionar', 'Gestionar usuarios del balneario'),
  ('integraciones.gestionar', 'Configurar credenciales de integraciones'),
  ('conversaciones.gestionar', 'Leer y responder conversaciones'),
  ('gavia.global', 'Acceso global de GAVIA');

insert into public.role_permissions (role_code, permission_code)
select 'owner', code from public.permissions where code <> 'gavia.global'
union all
select 'admin', code from public.permissions
  where code in ('plano.ver', 'reservas.gestionar', 'clientes.gestionar', 'cobros.registrar', 'conversaciones.gestionar')
union all
select 'superadmin', code from public.permissions;

-- ---------------------------------------------------------------------
-- Perfiles
-- ---------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null default '',
  platform_role text references public.roles(code) check (platform_role is null or platform_role = 'superadmin'),
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index profiles_email_idx on public.profiles (lower(email));

-- ---------------------------------------------------------------------
-- Planes, balnearios y membresías
-- ---------------------------------------------------------------------
create table public.plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text not null default '',
  price_cents bigint not null check (price_cents >= 0),
  billing_period text not null check (billing_period in ('mensual', 'temporada', 'anual')),
  max_units integer check (max_units is null or max_units > 0),
  features jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.balnearios (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  city text not null default '',
  address text not null default '',
  phone text not null default '',
  email text not null default '',
  status text not null default 'prueba' check (status in ('prueba', 'activo', 'suspendido', 'baja')),
  season_start date,
  season_end date,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (season_end is null or season_start is null or season_end >= season_start)
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  balneario_id uuid not null references public.balnearios(id) on delete cascade,
  role text not null references public.roles(code) check (role in ('owner', 'admin')),
  active boolean not null default true,
  -- Permiso explícito que el dueño puede otorgar a un administrador para editar los planos.
  can_edit_plano boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, balneario_id)
);
create index memberships_balneario_idx on public.memberships (balneario_id);

-- ---------------------------------------------------------------------
-- Planos personalizables
-- Cada balneario tiene dos planos independientes: 'playa' y 'cocheras'.
-- Las posiciones se guardan en celdas de una grilla (enteros).
-- ---------------------------------------------------------------------

-- Catálogo extensible de tipos de unidad reservable.
create table public.unit_kinds (
  code text primary key check (code ~ '^[a-z_]+$'),
  label text not null,
  map text not null check (map in ('playa', 'cocheras')),
  default_w integer not null check (default_w between 1 and 20),
  default_h integer not null check (default_h between 1 and 20),
  sort_order integer not null default 0
);
insert into public.unit_kinds (code, label, map, default_w, default_h, sort_order) values
  ('carpa', 'Carpa', 'playa', 3, 3, 0),
  ('sombrilla', 'Sombrilla', 'playa', 2, 2, 1),
  ('cochera', 'Cochera', 'cocheras', 2, 4, 2);

create table public.site_maps (
  balneario_id uuid not null references public.balnearios(id) on delete cascade,
  map text not null check (map in ('playa', 'cocheras')),
  width integer not null default 48 check (width between 10 and 200),
  height integer not null default 28 check (height between 10 and 200),
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  primary key (balneario_id, map)
);

create table public.sectors (
  id uuid primary key default gen_random_uuid(),
  balneario_id uuid not null references public.balnearios(id) on delete cascade,
  map text not null check (map in ('playa', 'cocheras')),
  name text not null check (length(name) between 1 and 60),
  x integer not null default 0 check (x >= 0),
  y integer not null default 0 check (y >= 0),
  w integer not null default 10 check (w between 1 and 200),
  h integer not null default 6 check (h between 1 and 200),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (id, balneario_id),
  unique (balneario_id, map, name)
);

-- Elementos no reservables del plano (pasillos, mar, edificios, etiquetas…).
create table public.map_elements (
  id uuid primary key default gen_random_uuid(),
  balneario_id uuid not null references public.balnearios(id) on delete cascade,
  map text not null check (map in ('playa', 'cocheras')),
  kind text not null check (kind in ('pasillo', 'mar', 'edificio', 'etiqueta', 'acceso', 'otro')),
  label text not null default '',
  x integer not null default 0 check (x >= 0),
  y integer not null default 0 check (y >= 0),
  w integer not null default 4 check (w between 1 and 200),
  h integer not null default 1 check (h between 1 and 200),
  created_at timestamptz not null default now()
);
create index map_elements_idx on public.map_elements (balneario_id, map);

create table public.units (
  id uuid primary key default gen_random_uuid(),
  balneario_id uuid not null references public.balnearios(id) on delete cascade,
  kind text not null references public.unit_kinds(code),
  map text not null check (map in ('playa', 'cocheras')),
  sector_id uuid,
  code text not null check (length(code) between 1 and 40),
  row_label text not null default '',
  x integer not null default 0 check (x >= 0),
  y integer not null default 0 check (y >= 0),
  w integer not null default 3 check (w between 1 and 20),
  h integer not null default 3 check (h between 1 and 20),
  out_of_service boolean not null default false,
  out_of_service_reason text not null default '',
  created_at timestamptz not null default now(),
  unique (id, balneario_id),
  unique (balneario_id, code),
  foreign key (sector_id, balneario_id) references public.sectors(id, balneario_id) on delete set null (sector_id)
);
create index units_map_idx on public.units (balneario_id, map);

-- Una unidad solo puede ubicarse en el plano que corresponde a su tipo.
create or replace function public.units_check_map() returns trigger language plpgsql as $$
begin
  if (select map from public.unit_kinds where code = new.kind) <> new.map then
    raise exception 'El tipo % no pertenece al plano %', new.kind, new.map using errcode = '23514';
  end if;
  if new.sector_id is not null and (select map from public.sectors where id = new.sector_id) <> new.map then
    raise exception 'El sector pertenece a otro plano' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger units_check_map before insert or update on public.units for each row execute function public.units_check_map();

-- ---------------------------------------------------------------------
-- CRM de clientes del balneario
-- ---------------------------------------------------------------------
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  balneario_id uuid not null references public.balnearios(id) on delete cascade,
  first_name text not null check (length(first_name) > 0),
  last_name text not null default '',
  phone text not null default '',
  whatsapp text not null default '',
  email text not null default '',
  document_id text not null default '',
  address text not null default '',
  notes text not null default '',
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, balneario_id)
);
create index customers_balneario_idx on public.customers (balneario_id, last_name, first_name);

-- ---------------------------------------------------------------------
-- Reservas
-- ---------------------------------------------------------------------
create sequence public.reservation_number_seq start 1001;

create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  number bigint not null unique default nextval('public.reservation_number_seq'),
  balneario_id uuid not null references public.balnearios(id) on delete cascade,
  customer_id uuid not null,
  start_date date not null,
  end_date date not null,
  total_cents bigint not null check (total_cents >= 0),
  paid_cents bigint not null default 0 check (paid_cents >= 0),
  balance_cents bigint generated always as (total_cents - paid_cents) stored,
  status text not null default 'pendiente' check (status in ('pendiente', 'confirmada', 'cancelada', 'finalizada')),
  notes text not null default '',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles(id) on delete set null,
  cancel_reason text,
  is_demo boolean not null default false,
  check (end_date >= start_date),
  check ((status = 'cancelada') = (cancelled_at is not null)),
  unique (id, balneario_id),
  foreign key (customer_id, balneario_id) references public.customers(id, balneario_id) on delete restrict
);
create index reservations_balneario_dates_idx on public.reservations (balneario_id, start_date, end_date);
create index reservations_customer_idx on public.reservations (customer_id);

-- Unidades asociadas a cada reserva. La restricción de exclusión garantiza
-- que una misma unidad no tenga dos reservas activas superpuestas.
create table public.reservation_units (
  reservation_id uuid not null,
  unit_id uuid not null,
  balneario_id uuid not null,
  period daterange not null,
  active boolean not null default true,
  primary key (reservation_id, unit_id),
  foreign key (reservation_id, balneario_id) references public.reservations(id, balneario_id) on delete cascade,
  foreign key (unit_id, balneario_id) references public.units(id, balneario_id) on delete restrict,
  constraint reservation_units_no_overlap exclude using gist (unit_id with =, period with &&) where (active)
);
create index reservation_units_unit_idx on public.reservation_units using gist (unit_id, period);

-- ---------------------------------------------------------------------
-- Pagos de clientes del balneario
-- ---------------------------------------------------------------------
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  balneario_id uuid not null references public.balnearios(id) on delete cascade,
  reservation_id uuid not null,
  amount_cents bigint not null check (amount_cents > 0),
  method text not null check (method in ('efectivo', 'transferencia', 'tarjeta', 'mercadopago_qr', 'otro')),
  status text not null default 'aprobado' check (status in ('aprobado', 'anulado')),
  paid_at timestamptz not null default now(),
  provider text,
  provider_payment_id text,
  payment_request_id uuid,
  notes text not null default '',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references public.profiles(id) on delete set null,
  void_reason text,
  is_demo boolean not null default false,
  check ((status = 'anulado') = (voided_at is not null)),
  foreign key (reservation_id, balneario_id) references public.reservations(id, balneario_id) on delete restrict
);
create unique index payments_provider_idx on public.payments (provider, provider_payment_id) where provider_payment_id is not null;
create index payments_balneario_idx on public.payments (balneario_id, paid_at);
create index payments_reservation_idx on public.payments (reservation_id);

-- Solicitudes de cobro (QR de Mercado Pago). Solo el backend con
-- privilegios de servicio puede marcarlas como aprobadas.
create table public.payment_requests (
  id uuid primary key default gen_random_uuid(),
  balneario_id uuid not null references public.balnearios(id) on delete cascade,
  reservation_id uuid not null,
  amount_cents bigint not null check (amount_cents > 0),
  provider text not null default 'mercadopago',
  mode text not null check (mode in ('prueba', 'produccion')),
  external_reference text not null unique,
  provider_order_id text,
  qr_data text,
  status text not null default 'creado' check (status in ('creado', 'aprobado', 'rechazado', 'expirado', 'cancelado', 'error')),
  status_detail text not null default '',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  resolved_at timestamptz,
  foreign key (reservation_id, balneario_id) references public.reservations(id, balneario_id) on delete cascade
);
create index payment_requests_reservation_idx on public.payment_requests (reservation_id);

alter table public.payments
  add constraint payments_request_fk foreign key (payment_request_id) references public.payment_requests(id) on delete set null;

-- Notificaciones recibidas de proveedores (idempotencia y trazabilidad).
create table public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_key text not null,
  payload jsonb not null,
  signature_valid boolean not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  result text,
  unique (provider, event_key)
);

-- ---------------------------------------------------------------------
-- Integraciones (configuración pública) y secretos (solo servicio)
-- ---------------------------------------------------------------------
create table public.integrations (
  id uuid primary key default gen_random_uuid(),
  balneario_id uuid references public.balnearios(id) on delete cascade,
  provider text not null check (provider in ('mercadopago', 'whatsapp')),
  mode text not null default 'prueba' check (mode in ('prueba', 'produccion')),
  status text not null default 'pendiente' check (status in ('pendiente', 'activa', 'error', 'desactivada')),
  public_config jsonb not null default '{}'::jsonb,
  has_secret boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);
create unique index integrations_scope_idx on public.integrations (coalesce(balneario_id, '00000000-0000-0000-0000-000000000000'::uuid), provider);

create table public.integration_secrets (
  integration_id uuid primary key references public.integrations(id) on delete cascade,
  ciphertext text not null,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Suscripciones y facturación propia de GAVIA
-- ---------------------------------------------------------------------
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  balneario_id uuid not null references public.balnearios(id) on delete cascade,
  plan_id uuid not null references public.plans(id) on delete restrict,
  status text not null default 'prueba' check (status in ('prueba', 'activa', 'vencida', 'cancelada')),
  price_cents bigint not null check (price_cents >= 0),
  current_period_start date not null,
  current_period_end date not null,
  created_at timestamptz not null default now(),
  check (current_period_end >= current_period_start)
);
create index subscriptions_balneario_idx on public.subscriptions (balneario_id);

create sequence public.gavia_invoice_number_seq start 1;

create table public.gavia_invoices (
  id uuid primary key default gen_random_uuid(),
  number bigint not null unique default nextval('public.gavia_invoice_number_seq'),
  balneario_id uuid not null references public.balnearios(id) on delete restrict,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  concept text not null,
  amount_cents bigint not null check (amount_cents > 0),
  issued_at date not null default current_date,
  due_date date not null,
  status text not null default 'emitida' check (status in ('emitida', 'pagada', 'vencida', 'anulada')),
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.gavia_payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.gavia_invoices(id) on delete restrict,
  balneario_id uuid not null references public.balnearios(id) on delete restrict,
  amount_cents bigint not null check (amount_cents > 0),
  method text not null check (method in ('transferencia', 'mercadopago', 'efectivo', 'otro')),
  reference text not null default '',
  paid_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null
);

-- ---------------------------------------------------------------------
-- CRM comercial de GAVIA (prospectos)
-- ---------------------------------------------------------------------
create table public.leads (
  id uuid primary key default gen_random_uuid(),
  business_name text not null,
  contact_name text not null default '',
  phone text not null default '',
  email text not null default '',
  city text not null default '',
  stage text not null default 'prospecto' check (stage in ('prospecto', 'contactado', 'demo', 'propuesta', 'ganado', 'perdido')),
  source text not null default '',
  notes text not null default '',
  assigned_to uuid references public.profiles(id) on delete set null,
  balneario_id uuid references public.balnearios(id) on delete set null,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Interacciones, recordatorios y eventos (scope: balneario | gavia)
-- ---------------------------------------------------------------------
create table public.interactions (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('balneario', 'gavia')),
  balneario_id uuid references public.balnearios(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  kind text not null check (kind in ('llamada', 'whatsapp', 'email', 'reunion', 'nota')),
  summary text not null,
  occurred_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  check ((scope = 'balneario' and balneario_id is not null and lead_id is null)
      or (scope = 'gavia' and customer_id is null))
);

create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('balneario', 'gavia')),
  balneario_id uuid references public.balnearios(id) on delete cascade,
  kind text not null check (kind in ('cliente', 'reserva', 'tarea', 'comercial')),
  title text not null check (length(title) > 0),
  description text not null default '',
  due_at timestamptz not null,
  status text not null default 'pendiente' check (status in ('pendiente', 'completado', 'cancelado')),
  assigned_to uuid references public.profiles(id) on delete set null,
  customer_id uuid references public.customers(id) on delete cascade,
  reservation_id uuid references public.reservations(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  is_demo boolean not null default false,
  check ((scope = 'balneario' and balneario_id is not null and lead_id is null and kind <> 'comercial')
      or (scope = 'gavia' and customer_id is null and reservation_id is null))
);
create index reminders_scope_idx on public.reminders (scope, balneario_id, due_at);

create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('balneario', 'gavia')),
  balneario_id uuid references public.balnearios(id) on delete cascade,
  title text not null,
  description text not null default '',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (ends_at >= starts_at),
  check ((scope = 'balneario') = (balneario_id is not null))
);

-- ---------------------------------------------------------------------
-- Conversaciones de WhatsApp
-- ---------------------------------------------------------------------
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('balneario', 'gavia')),
  balneario_id uuid references public.balnearios(id) on delete cascade,
  channel text not null default 'whatsapp' check (channel in ('whatsapp')),
  contact_name text not null default '',
  contact_phone text not null,
  customer_id uuid references public.customers(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  reservation_id uuid references public.reservations(id) on delete set null,
  status text not null default 'abierta' check (status in ('abierta', 'pendiente', 'cerrada')),
  unread_count integer not null default 0 check (unread_count >= 0),
  last_message_at timestamptz,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  check ((scope = 'balneario') = (balneario_id is not null)),
  check (scope = 'balneario' or (customer_id is null and reservation_id is null))
);
create unique index conversations_contact_idx
  on public.conversations (scope, coalesce(balneario_id, '00000000-0000-0000-0000-000000000000'::uuid), channel, contact_phone);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  direction text not null check (direction in ('entrante', 'saliente')),
  body text not null,
  status text not null check (status in ('recibido', 'en_cola', 'enviado', 'entregado', 'leido', 'fallido')),
  provider_message_id text unique,
  sent_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  is_demo boolean not null default false
);
create index messages_conversation_idx on public.messages (conversation_id, created_at);

-- ---------------------------------------------------------------------
-- Auditoría (solo inserción mediante funciones internas)
-- ---------------------------------------------------------------------
create table public.audit_log (
  id bigserial primary key,
  balneario_id uuid references public.balnearios(id) on delete set null,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity text not null,
  entity_id text,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_balneario_idx on public.audit_log (balneario_id, created_at desc);

-- =====================================================================
-- Funciones auxiliares de autorización (security definer, sin recursión RLS)
-- =====================================================================
create or replace function public.is_superadmin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and platform_role = 'superadmin');
$$;

create or replace function public.member_role(p_balneario uuid) returns text
language sql stable security definer set search_path = public as $$
  select role from public.memberships
  where user_id = auth.uid() and balneario_id = p_balneario and active;
$$;

create or replace function public.is_member(p_balneario uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.member_role(p_balneario) is not null;
$$;

create or replace function public.is_owner(p_balneario uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.member_role(p_balneario) = 'owner', false);
$$;

-- Edición de planos: dueño, o administrador con permiso explícito.
create or replace function public.can_edit_plano(p_balneario uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_superadmin() or exists (
    select 1 from public.memberships
    where user_id = auth.uid() and balneario_id = p_balneario and active
      and (role = 'owner' or can_edit_plano));
$$;

-- Ventana operativa del administrador: reservas vigentes, futuras o
-- finalizadas hace menos de 30 días.
create or replace function public.in_admin_window(p_end date) returns boolean
language sql stable as $$ select p_end >= current_date - 30; $$;

create or replace function public.can_read_reservation(p_balneario uuid, p_end date) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_superadmin() or public.is_owner(p_balneario)
      or (public.is_member(p_balneario) and public.in_admin_window(p_end));
$$;

create or replace function public.shares_balneario(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.memberships mine
    join public.memberships theirs on theirs.balneario_id = mine.balneario_id
    where mine.user_id = auth.uid() and mine.active and theirs.user_id = p_user
  );
$$;

create or replace function public.local_date(p_ts timestamptz) returns date
language sql immutable as $$ select (p_ts at time zone 'America/Argentina/Buenos_Aires')::date; $$;

-- Busca un perfil por correo (solo dueños o superadmin), para asociar usuarios.
create or replace function public.find_profile_id_by_email(p_email text) returns uuid
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.is_superadmin() or exists (
    select 1 from public.memberships where user_id = auth.uid() and role = 'owner' and active)) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  return (select id from public.profiles where lower(email) = lower(p_email));
end $$;

-- =====================================================================
-- Triggers
-- =====================================================================
create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create trigger balnearios_updated before update on public.balnearios for each row execute function public.set_updated_at();
create trigger customers_updated before update on public.customers for each row execute function public.set_updated_at();
create trigger reservations_updated before update on public.reservations for each row execute function public.set_updated_at();
create trigger leads_updated before update on public.leads for each row execute function public.set_updated_at();

-- Alta automática de perfil al crear un usuario de autenticación.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Evita la escalada de privilegios: solo un superadmin (o el servicio) cambia platform_role.
create or replace function public.guard_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.platform_role is distinct from old.platform_role
     and auth.uid() is not null and not public.is_superadmin() then
    raise exception 'No autorizado para cambiar el rol de plataforma' using errcode = '42501';
  end if;
  if new.email is distinct from old.email and auth.uid() is not null then
    raise exception 'El correo se modifica desde autenticación' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger profiles_guard before update on public.profiles for each row execute function public.guard_profile();

-- El dueño no puede cambiar estado comercial ni identificador del balneario.
create or replace function public.guard_balneario() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_superadmin()
     and (new.status is distinct from old.status or new.slug is distinct from old.slug or new.is_demo is distinct from old.is_demo) then
    raise exception 'Solo GAVIA puede modificar el estado del balneario' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger balnearios_guard before update on public.balnearios for each row execute function public.guard_balneario();

-- Sincroniza el período y estado de las unidades reservadas.
create or replace function public.reservation_units_fill() returns trigger
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  select balneario_id, start_date, end_date, status into r from public.reservations where id = new.reservation_id;
  if not found then raise exception 'Reserva inexistente'; end if;
  new.balneario_id := r.balneario_id;
  new.period := daterange(r.start_date, r.end_date, '[]');
  new.active := r.status in ('pendiente', 'confirmada', 'finalizada');
  return new;
end $$;
create trigger reservation_units_fill before insert on public.reservation_units
  for each row execute function public.reservation_units_fill();

create or replace function public.reservation_sync_units() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.start_date is distinct from old.start_date or new.end_date is distinct from old.end_date
     or new.status is distinct from old.status then
    update public.reservation_units
       set period = daterange(new.start_date, new.end_date, '[]'),
           active = new.status in ('pendiente', 'confirmada', 'finalizada')
     where reservation_id = new.id;
  end if;
  return new;
end $$;
create trigger reservations_sync_units after update on public.reservations
  for each row execute function public.reservation_sync_units();

-- Mantiene reservations.paid_cents como suma de pagos aprobados.
create or replace function public.payments_recalc() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_res uuid := coalesce(new.reservation_id, old.reservation_id);
begin
  update public.reservations
     set paid_cents = (select coalesce(sum(amount_cents), 0) from public.payments
                       where reservation_id = v_res and status = 'aprobado')
   where id = v_res;
  return null;
end $$;
create trigger payments_recalc after insert or update or delete on public.payments
  for each row execute function public.payments_recalc();

-- Los pagos son inmutables salvo su anulación.
create or replace function public.guard_payment() returns trigger language plpgsql as $$
begin
  if new.amount_cents <> old.amount_cents or new.reservation_id <> old.reservation_id
     or new.method <> old.method or new.balneario_id <> old.balneario_id
     or new.paid_at <> old.paid_at then
    raise exception 'Un pago registrado no se modifica: anulalo y registrá uno nuevo' using errcode = '42501';
  end if;
  if old.status = 'anulado' and new.status <> 'anulado' then
    raise exception 'Un pago anulado no puede reactivarse' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger payments_guard before update on public.payments for each row execute function public.guard_payment();

-- Auditoría genérica de cambios sensibles.
create or replace function public.audit_trigger() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_row jsonb := to_jsonb(coalesce(new, old));
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end;
  v_action text := tg_table_name || '.' || lower(tg_op);
  v_changes jsonb := '{}'::jsonb;
  k text;
begin
  if tg_op = 'UPDATE' then
    for k in select jsonb_object_keys(v_row) loop
      if k not in ('updated_at') and (v_row -> k) is distinct from (v_old -> k) then
        v_changes := v_changes || jsonb_build_object(k, jsonb_build_object('antes', v_old -> k, 'despues', v_row -> k));
      end if;
    end loop;
    if v_changes = '{}'::jsonb then return null; end if;
    if tg_table_name = 'reservations' and v_row ->> 'status' = 'cancelada' and v_old ->> 'status' <> 'cancelada' then
      v_action := 'reservations.cancel';
    elsif tg_table_name = 'payments' and v_row ->> 'status' = 'anulado' and v_old ->> 'status' <> 'anulado' then
      v_action := 'payments.void';
    elsif tg_table_name = 'reservations' and v_changes ?| array['paid_cents'] and (v_changes - 'paid_cents' - 'balance_cents') = '{}'::jsonb then
      return null; -- recálculo automático de saldo: ya auditado en payments
    end if;
  end if;
  insert into public.audit_log (balneario_id, actor_id, action, entity, entity_id, data)
  values (
    case when tg_table_name = 'balnearios' then (v_row ->> 'id')::uuid else nullif(v_row ->> 'balneario_id', '')::uuid end,
    auth.uid(), v_action, tg_table_name, v_row ->> 'id',
    case tg_op when 'INSERT' then jsonb_build_object('nuevo', v_row - 'ciphertext')
               when 'DELETE' then jsonb_build_object('eliminado', v_old)
               else v_changes end
  );
  return null;
end $$;

create trigger audit_reservations after insert or update on public.reservations for each row execute function public.audit_trigger();
create trigger audit_payments after insert or update on public.payments for each row execute function public.audit_trigger();
create trigger audit_memberships after insert or update or delete on public.memberships for each row execute function public.audit_trigger();
create trigger audit_units after insert or update or delete on public.units for each row execute function public.audit_trigger();
create trigger audit_sectors after insert or update or delete on public.sectors for each row execute function public.audit_trigger();
create trigger audit_map_elements after insert or update or delete on public.map_elements for each row execute function public.audit_trigger();
create trigger audit_balnearios after insert or update on public.balnearios for each row execute function public.audit_trigger();
create trigger audit_integrations after insert or update on public.integrations for each row execute function public.audit_trigger();
create trigger audit_plans after insert or update on public.plans for each row execute function public.audit_trigger();
create trigger audit_subscriptions after insert or update on public.subscriptions for each row execute function public.audit_trigger();
create trigger audit_gavia_invoices after insert or update on public.gavia_invoices for each row execute function public.audit_trigger();

-- Registro explícito de acciones administrativas desde el backend.
create or replace function public.log_action(p_balneario uuid, p_action text, p_entity text, p_entity_id text, p_data jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_balneario is not null and not (public.is_member(p_balneario) or public.is_superadmin()) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if p_balneario is null and not public.is_superadmin() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  insert into public.audit_log (balneario_id, actor_id, action, entity, entity_id, data)
  values (p_balneario, auth.uid(), p_action, p_entity, p_entity_id, coalesce(p_data, '{}'::jsonb));
end $$;

-- =====================================================================
-- Reportes financieros (solo dueño del balneario o superadmin)
-- Definiciones:
--   facturación  = importe total de reservas no canceladas que comienzan en el período.
--   cobros       = pagos aprobados con fecha de cobro dentro del período.
--   saldo        = total - cobrado de reservas no canceladas que comienzan en el período.
-- =====================================================================
create or replace function public.finance_summary(p_balneario uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.is_owner(p_balneario) or public.is_superadmin()) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'facturacion', (select coalesce(sum(total_cents), 0) from public.reservations
                     where balneario_id = p_balneario and status <> 'cancelada' and start_date between p_from and p_to),
    'cobros', (select coalesce(sum(amount_cents), 0) from public.payments
                where balneario_id = p_balneario and status = 'aprobado' and public.local_date(paid_at) between p_from and p_to),
    'saldo_pendiente', (select coalesce(sum(greatest(total_cents - paid_cents, 0)), 0) from public.reservations
                         where balneario_id = p_balneario and status <> 'cancelada' and start_date between p_from and p_to),
    'por_medio', (select coalesce(jsonb_object_agg(method, total), '{}'::jsonb) from (
                    select method, sum(amount_cents) as total from public.payments
                    where balneario_id = p_balneario and status = 'aprobado' and public.local_date(paid_at) between p_from and p_to
                    group by method) x),
    'por_mes', (select coalesce(jsonb_agg(jsonb_build_object('mes', mes, 'facturacion', fact, 'cobros', cob) order by mes), '[]'::jsonb) from (
                  select m.mes,
                    (select coalesce(sum(total_cents), 0) from public.reservations r
                      where r.balneario_id = p_balneario and r.status <> 'cancelada'
                        and to_char(r.start_date, 'YYYY-MM') = m.mes) as fact,
                    (select coalesce(sum(amount_cents), 0) from public.payments p
                      where p.balneario_id = p_balneario and p.status = 'aprobado'
                        and to_char(public.local_date(p.paid_at), 'YYYY-MM') = m.mes) as cob
                  from (select distinct to_char(d, 'YYYY-MM') as mes
                        from generate_series(date_trunc('month', p_from), p_to, interval '1 month') d) m) y)
  );
end $$;

-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.profiles enable row level security;
alter table public.plans enable row level security;
alter table public.balnearios enable row level security;
alter table public.memberships enable row level security;
alter table public.unit_kinds enable row level security;
alter table public.site_maps enable row level security;
alter table public.sectors enable row level security;
alter table public.map_elements enable row level security;
alter table public.units enable row level security;
alter table public.customers enable row level security;
alter table public.reservations enable row level security;
alter table public.reservation_units enable row level security;
alter table public.payments enable row level security;
alter table public.payment_requests enable row level security;
alter table public.webhook_events enable row level security;
alter table public.integrations enable row level security;
alter table public.integration_secrets enable row level security;
alter table public.subscriptions enable row level security;
alter table public.gavia_invoices enable row level security;
alter table public.gavia_payments enable row level security;
alter table public.leads enable row level security;
alter table public.interactions enable row level security;
alter table public.reminders enable row level security;
alter table public.calendar_events enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.audit_log enable row level security;

-- Catálogos
create policy roles_read on public.roles for select to authenticated using (true);
create policy permissions_read on public.permissions for select to authenticated using (true);
create policy role_permissions_read on public.role_permissions for select to authenticated using (true);
create policy plans_read on public.plans for select to authenticated using (true);
create policy plans_write on public.plans for all to authenticated using (public.is_superadmin()) with check (public.is_superadmin());

-- Perfiles
create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_superadmin() or public.shares_balneario(id));
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_superadmin()) with check (id = auth.uid() or public.is_superadmin());

-- Balnearios
create policy balnearios_read on public.balnearios for select to authenticated
  using (public.is_superadmin() or public.is_member(id));
create policy balnearios_insert on public.balnearios for insert to authenticated with check (public.is_superadmin());
create policy balnearios_update on public.balnearios for update to authenticated
  using (public.is_superadmin() or public.is_owner(id)) with check (public.is_superadmin() or public.is_owner(id));

-- Membresías: el dueño solo gestiona administradores de su balneario.
create policy memberships_read on public.memberships for select to authenticated
  using (user_id = auth.uid() or public.is_superadmin() or public.is_owner(balneario_id));
create policy memberships_insert on public.memberships for insert to authenticated
  with check (public.is_superadmin() or (public.is_owner(balneario_id) and role = 'admin'));
create policy memberships_update on public.memberships for update to authenticated
  using (public.is_superadmin() or (public.is_owner(balneario_id) and role = 'admin'))
  with check (public.is_superadmin() or (public.is_owner(balneario_id) and role = 'admin'));
create policy memberships_delete on public.memberships for delete to authenticated
  using (public.is_superadmin() or (public.is_owner(balneario_id) and role = 'admin'));

-- Planos: lectura para miembros; estructura editable por dueño o admin con permiso.
create policy unit_kinds_read on public.unit_kinds for select to authenticated using (true);
create policy site_maps_read on public.site_maps for select to authenticated using (public.is_superadmin() or public.is_member(balneario_id));
create policy site_maps_write on public.site_maps for all to authenticated
  using (public.can_edit_plano(balneario_id)) with check (public.can_edit_plano(balneario_id));
create policy sectors_read on public.sectors for select to authenticated using (public.is_superadmin() or public.is_member(balneario_id));
create policy sectors_write on public.sectors for all to authenticated
  using (public.can_edit_plano(balneario_id)) with check (public.can_edit_plano(balneario_id));
create policy map_elements_read on public.map_elements for select to authenticated using (public.is_superadmin() or public.is_member(balneario_id));
create policy map_elements_write on public.map_elements for all to authenticated
  using (public.can_edit_plano(balneario_id)) with check (public.can_edit_plano(balneario_id));
create policy units_read on public.units for select to authenticated using (public.is_superadmin() or public.is_member(balneario_id));
create policy units_write on public.units for all to authenticated
  using (public.can_edit_plano(balneario_id)) with check (public.can_edit_plano(balneario_id));

-- Clientes
create policy customers_read on public.customers for select to authenticated using (public.is_superadmin() or public.is_member(balneario_id));
create policy customers_insert on public.customers for insert to authenticated with check (public.is_member(balneario_id));
create policy customers_update on public.customers for update to authenticated
  using (public.is_member(balneario_id)) with check (public.is_member(balneario_id));
create policy customers_delete on public.customers for delete to authenticated using (public.is_owner(balneario_id));

-- Reservas (sin borrado: se cancelan y queda auditoría)
create policy reservations_read on public.reservations for select to authenticated
  using (public.can_read_reservation(balneario_id, end_date));
create policy reservations_insert on public.reservations for insert to authenticated
  with check (public.is_member(balneario_id) and created_by = auth.uid());
create policy reservations_update on public.reservations for update to authenticated
  using (public.can_read_reservation(balneario_id, end_date) and public.is_member(balneario_id))
  with check (public.is_member(balneario_id));

create policy reservation_units_read on public.reservation_units for select to authenticated
  using (public.is_superadmin() or public.is_member(balneario_id));
create policy reservation_units_insert on public.reservation_units for insert to authenticated
  with check (exists (select 1 from public.reservations r where r.id = reservation_id and public.is_member(r.balneario_id)));
create policy reservation_units_delete on public.reservation_units for delete to authenticated
  using (public.is_member(balneario_id));

-- Pagos: registros internos (efectivo/transferencia/tarjeta) por miembros;
-- los cobros de Mercado Pago solo los inserta el backend tras validar la notificación.
create policy payments_read on public.payments for select to authenticated
  using (public.is_superadmin() or public.is_owner(balneario_id)
         or (public.is_member(balneario_id) and exists (
           select 1 from public.reservations r where r.id = reservation_id and public.in_admin_window(r.end_date))));
create policy payments_insert on public.payments for insert to authenticated
  with check (public.is_member(balneario_id) and created_by = auth.uid()
              and method in ('efectivo', 'transferencia', 'tarjeta', 'otro')
              and status = 'aprobado' and provider is null and provider_payment_id is null);
create policy payments_void on public.payments for update to authenticated
  using (public.is_owner(balneario_id)) with check (public.is_owner(balneario_id));

create policy payment_requests_read on public.payment_requests for select to authenticated
  using (public.is_superadmin() or public.is_member(balneario_id));
create policy payment_requests_insert on public.payment_requests for insert to authenticated
  with check (public.is_member(balneario_id) and created_by = auth.uid() and status = 'creado');

-- webhook_events e integration_secrets: sin políticas => solo servicio.

create policy integrations_read on public.integrations for select to authenticated
  using ((balneario_id is null and public.is_superadmin()) or (balneario_id is not null and (public.is_member(balneario_id) or public.is_superadmin())));
create policy integrations_write on public.integrations for all to authenticated
  using ((balneario_id is null and public.is_superadmin()) or (balneario_id is not null and public.is_owner(balneario_id)))
  with check ((balneario_id is null and public.is_superadmin()) or (balneario_id is not null and public.is_owner(balneario_id)));

-- Suscripciones y facturación GAVIA
create policy subscriptions_read on public.subscriptions for select to authenticated
  using (public.is_superadmin() or public.is_owner(balneario_id));
create policy subscriptions_write on public.subscriptions for all to authenticated
  using (public.is_superadmin()) with check (public.is_superadmin());
create policy gavia_invoices_read on public.gavia_invoices for select to authenticated
  using (public.is_superadmin() or public.is_owner(balneario_id));
create policy gavia_invoices_write on public.gavia_invoices for all to authenticated
  using (public.is_superadmin()) with check (public.is_superadmin());
create policy gavia_payments_read on public.gavia_payments for select to authenticated
  using (public.is_superadmin() or public.is_owner(balneario_id));
create policy gavia_payments_write on public.gavia_payments for all to authenticated
  using (public.is_superadmin()) with check (public.is_superadmin());

-- CRM comercial GAVIA
create policy leads_all on public.leads for all to authenticated using (public.is_superadmin()) with check (public.is_superadmin());

-- Datos con scope balneario | gavia
create policy interactions_all on public.interactions for all to authenticated
  using ((scope = 'gavia' and public.is_superadmin()) or (scope = 'balneario' and public.is_member(balneario_id)))
  with check ((scope = 'gavia' and public.is_superadmin()) or (scope = 'balneario' and public.is_member(balneario_id)));
create policy reminders_all on public.reminders for all to authenticated
  using ((scope = 'gavia' and public.is_superadmin()) or (scope = 'balneario' and public.is_member(balneario_id)))
  with check ((scope = 'gavia' and public.is_superadmin()) or (scope = 'balneario' and public.is_member(balneario_id)));
create policy calendar_events_all on public.calendar_events for all to authenticated
  using ((scope = 'gavia' and public.is_superadmin()) or (scope = 'balneario' and public.is_member(balneario_id)))
  with check ((scope = 'gavia' and public.is_superadmin()) or (scope = 'balneario' and public.is_member(balneario_id)));
create policy conversations_all on public.conversations for all to authenticated
  using ((scope = 'gavia' and public.is_superadmin()) or (scope = 'balneario' and public.is_member(balneario_id)))
  with check ((scope = 'gavia' and public.is_superadmin()) or (scope = 'balneario' and public.is_member(balneario_id)));
create policy messages_read on public.messages for select to authenticated
  using (exists (select 1 from public.conversations c where c.id = conversation_id));
create policy messages_insert on public.messages for insert to authenticated
  with check (direction = 'saliente' and sent_by = auth.uid()
              and exists (select 1 from public.conversations c where c.id = conversation_id));

-- Auditoría: lectura para superadmin y dueños de su balneario. Sin escritura directa.
create policy audit_read on public.audit_log for select to authenticated
  using (public.is_superadmin() or (balneario_id is not null and public.is_owner(balneario_id)));

-- =====================================================================
-- Privilegios
-- =====================================================================
revoke all on all tables in schema public from anon;
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
revoke all on public.integration_secrets, public.webhook_events from authenticated;
revoke insert, update, delete on public.audit_log from authenticated;
grant execute on all functions in schema public to authenticated;
