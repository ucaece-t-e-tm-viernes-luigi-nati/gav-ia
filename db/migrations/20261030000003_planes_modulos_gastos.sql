-- =====================================================================
-- Planes START / PRO / PLUS con módulos habilitados por plan,
-- módulo de gastos del dueño y tamaño predeterminado de carpas (2x2).
-- =====================================================================

-- Carpas: 2x2 celdas por defecto.
update public.unit_kinds set default_w = 2, default_h = 2 where code = 'carpa';

-- ---------------------------------------------------------------------
-- Planes y módulos
-- Módulos restringidos: whatsapp, ia, ocupacion, pagos, contabilium.
-- Plano, reservas, clientes, calendario, gastos y usuarios están en todos.
-- ---------------------------------------------------------------------
alter table public.plans add column if not exists modules text[] not null default '{}';

update public.plans set code = 'start', name = 'START', sort_order = 0,
  description = 'Plano interactivo, disponibilidad por fechas y fichas completas de clientes.',
  features = '["Plano interactivo", "Carpas, sombrillas y cocheras", "Disponibilidad por fechas", "Fichas completas de clientes"]'::jsonb,
  modules = '{}'
where code = 'inicial';

update public.plans set code = 'pro', name = 'PRO', sort_order = 1,
  description = 'Todo lo de START, con WhatsApp, inteligencia artificial y análisis de ocupación.',
  features = '["Todo lo del plan START", "Inteligencia artificial", "WhatsApp integrado", "Atención 24/7", "Consultas, recomendaciones y reservas", "Análisis de ocupación"]'::jsonb,
  modules = '{whatsapp,ia,ocupacion}'
where code = 'profesional';

update public.plans set code = 'plus', name = 'PLUS', sort_order = 2,
  description = 'Todo lo de PRO, con pagos integrados y contabilidad.',
  features = '["Todo lo del plan PRO", "Integración de pagos", "Historial de pagos y saldos pendientes", "Integración con Contabilium"]'::jsonb,
  modules = '{whatsapp,ia,ocupacion,pagos,contabilium}'
where code = 'integral';

insert into public.plans (code, name, description, price_cents, billing_period, features, modules, sort_order) values
  ('start', 'START', 'Plano interactivo, disponibilidad por fechas y fichas completas de clientes.', 0, 'temporada',
   '["Plano interactivo", "Carpas, sombrillas y cocheras", "Disponibilidad por fechas", "Fichas completas de clientes"]'::jsonb, '{}', 0),
  ('pro', 'PRO', 'Todo lo de START, con WhatsApp, inteligencia artificial y análisis de ocupación.', 0, 'temporada',
   '["Todo lo del plan START", "Inteligencia artificial", "WhatsApp integrado", "Atención 24/7", "Consultas, recomendaciones y reservas", "Análisis de ocupación"]'::jsonb, '{whatsapp,ia,ocupacion}', 1),
  ('plus', 'PLUS', 'Todo lo de PRO, con pagos integrados y contabilidad.', 0, 'temporada',
   '["Todo lo del plan PRO", "Integración de pagos", "Historial de pagos y saldos pendientes", "Integración con Contabilium"]'::jsonb, '{whatsapp,ia,ocupacion,pagos,contabilium}', 2)
on conflict (code) do nothing;

alter table public.plans add constraint plans_modules_valid
  check (modules <@ array['whatsapp', 'ia', 'ocupacion', 'pagos', 'contabilium']::text[]);

-- Módulos del plan vigente (suscripción en prueba o activa más reciente).
create or replace function public.balneario_modules(p_balneario uuid) returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce((
    select p.modules from public.subscriptions s join public.plans p on p.id = s.plan_id
     where s.balneario_id = p_balneario and s.status in ('prueba', 'activa')
     order by s.created_at desc limit 1), '{}'::text[]);
$$;

create or replace function public.has_module(p_balneario uuid, p_module text) returns boolean
language sql stable security definer set search_path = public as $$
  select p_module = any(public.balneario_modules(p_balneario));
$$;

-- Restricciones en la base: cobros solo con 'pagos'; conversaciones de balneario solo con 'whatsapp'.
drop policy if exists payments_insert on public.payments;
create policy payments_insert on public.payments for insert to authenticated
  with check (public.is_member(balneario_id) and created_by = auth.uid()
              and method in ('efectivo', 'transferencia', 'tarjeta', 'otro')
              and status = 'aprobado' and provider is null and provider_payment_id is null
              and public.has_module(balneario_id, 'pagos'));

drop policy if exists payment_requests_insert on public.payment_requests;
create policy payment_requests_insert on public.payment_requests for insert to authenticated
  with check (public.is_member(balneario_id) and created_by = auth.uid() and status = 'creado'
              and public.has_module(balneario_id, 'pagos'));

drop policy if exists conversations_all on public.conversations;
create policy conversations_all on public.conversations for all to authenticated
  using ((scope = 'gavia' and public.is_superadmin())
         or (scope = 'balneario' and public.is_member(balneario_id) and public.has_module(balneario_id, 'whatsapp')))
  with check ((scope = 'gavia' and public.is_superadmin())
              or (scope = 'balneario' and public.is_member(balneario_id) and public.has_module(balneario_id, 'whatsapp')));

-- ---------------------------------------------------------------------
-- Gastos del balneario (solo el dueño)
-- ---------------------------------------------------------------------
create table public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  balneario_id uuid not null references public.balnearios(id) on delete cascade,
  name text not null check (length(name) between 1 and 60),
  created_at timestamptz not null default now(),
  unique (id, balneario_id),
  unique (balneario_id, name)
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  balneario_id uuid not null references public.balnearios(id) on delete cascade,
  category_id uuid not null,
  spent_on date not null,
  amount_cents bigint not null check (amount_cents > 0),
  description text not null default '',
  payment_method text not null default 'efectivo' check (payment_method in ('efectivo', 'transferencia', 'tarjeta', 'otro')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (category_id, balneario_id) references public.expense_categories(id, balneario_id) on delete restrict
);
create index expenses_balneario_date_idx on public.expenses (balneario_id, spent_on);

alter table public.expense_categories enable row level security;
alter table public.expenses enable row level security;
create policy expense_categories_owner on public.expense_categories for all to authenticated
  using (public.is_owner(balneario_id)) with check (public.is_owner(balneario_id));
create policy expenses_owner on public.expenses for all to authenticated
  using (public.is_owner(balneario_id)) with check (public.is_owner(balneario_id));
grant select, insert, update, delete on public.expense_categories, public.expenses to authenticated;

create trigger audit_expense_categories after insert or update or delete on public.expense_categories for each row execute function public.audit_trigger();
create trigger audit_expenses after insert or update or delete on public.expenses for each row execute function public.audit_trigger();
