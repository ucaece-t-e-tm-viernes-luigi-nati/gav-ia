-- =====================================================================
-- Permisos por sección para superadmins, etapas comerciales de los balnearios,
-- precios en dólares, facturación en cuotas, agenda pública de demos y
-- confidencialidad de la información financiera de cada balneario.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Permisos de plataforma (superadmins de GAVIA)
-- ---------------------------------------------------------------------
alter table public.profiles add column if not exists platform_permissions text[] not null default '{}';
alter table public.profiles add constraint profiles_platform_permissions_valid check (
  platform_permissions <@ array['dashboard', 'balnearios', 'crm', 'calendario', 'conversaciones', 'suscripciones',
                                'facturacion', 'reportes', 'usuarios', 'planes', 'auditoria']::text[]);
-- Los superadmins existentes conservan acceso completo.
update public.profiles
   set platform_permissions = array['dashboard', 'balnearios', 'crm', 'calendario', 'conversaciones', 'suscripciones',
                                    'facturacion', 'reportes', 'usuarios', 'planes', 'auditoria']
 where platform_role = 'superadmin';

create or replace function public.is_platform_user() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and platform_role = 'superadmin');
$$;

create or replace function public.platform_can(p_permission text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles
                  where id = auth.uid() and platform_role = 'superadmin' and p_permission = any(platform_permissions));
$$;

-- is_superadmin() se usa en las políticas de datos de cada balneario: ahora exige
-- el permiso "balnearios" (supervisión y gestión de establecimientos).
create or replace function public.is_superadmin() returns boolean
language sql stable security definer set search_path = public as $$
  select public.platform_can('balnearios');
$$;

-- Cambios de rol y de permisos de plataforma: solo con el permiso "usuarios".
create or replace function public.guard_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (new.platform_role is distinct from old.platform_role or new.platform_permissions is distinct from old.platform_permissions)
     and auth.uid() is not null and not public.platform_can('usuarios') then
    raise exception 'No autorizado para cambiar roles o permisos de GAVIA' using errcode = '42501';
  end if;
  if new.email is distinct from old.email and auth.uid() is not null then
    raise exception 'El correo se modifica desde autenticación' using errcode = '42501';
  end if;
  return new;
end $$;

create or replace function public.find_profile_id_by_email(p_email text) returns uuid
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.platform_can('balnearios') or public.platform_can('usuarios') or exists (
    select 1 from public.memberships where user_id = auth.uid() and role = 'owner' and active)) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  return (select id from public.profiles where lower(email) = lower(p_email));
end $$;

create or replace function public.log_action(p_balneario uuid, p_action text, p_entity text, p_entity_id text, p_data jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_balneario is not null and not (public.is_member(p_balneario) or public.is_superadmin()) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if p_balneario is null and not public.is_platform_user() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  insert into public.audit_log (balneario_id, actor_id, action, entity, entity_id, data)
  values (p_balneario, auth.uid(), p_action, p_entity, p_entity_id, coalesce(p_data, '{}'::jsonb));
end $$;

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_superadmin() or public.platform_can('usuarios') or public.shares_balneario(id));
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid() or public.platform_can('usuarios')) with check (id = auth.uid() or public.platform_can('usuarios'));

-- Secciones de GAVIA con su permiso específico
drop policy if exists plans_write on public.plans;
create policy plans_write on public.plans for all to authenticated using (public.platform_can('planes')) with check (public.platform_can('planes'));

drop policy if exists subscriptions_read on public.subscriptions;
create policy subscriptions_read on public.subscriptions for select to authenticated
  using (public.platform_can('suscripciones') or public.platform_can('facturacion') or public.platform_can('balnearios') or public.is_owner(balneario_id));
drop policy if exists subscriptions_write on public.subscriptions;
create policy subscriptions_write on public.subscriptions for all to authenticated
  using (public.platform_can('suscripciones') or public.platform_can('balnearios'))
  with check (public.platform_can('suscripciones') or public.platform_can('balnearios'));

drop policy if exists gavia_invoices_read on public.gavia_invoices;
create policy gavia_invoices_read on public.gavia_invoices for select to authenticated
  using (public.platform_can('facturacion') or public.is_owner(balneario_id));
drop policy if exists gavia_invoices_write on public.gavia_invoices;
create policy gavia_invoices_write on public.gavia_invoices for all to authenticated
  using (public.platform_can('facturacion')) with check (public.platform_can('facturacion'));
drop policy if exists gavia_payments_read on public.gavia_payments;
create policy gavia_payments_read on public.gavia_payments for select to authenticated
  using (public.platform_can('facturacion') or public.is_owner(balneario_id));
drop policy if exists gavia_payments_write on public.gavia_payments;
create policy gavia_payments_write on public.gavia_payments for all to authenticated
  using (public.platform_can('facturacion')) with check (public.platform_can('facturacion'));

drop policy if exists leads_all on public.leads;
create policy leads_all on public.leads for all to authenticated using (public.platform_can('crm')) with check (public.platform_can('crm'));

drop policy if exists interactions_all on public.interactions;
create policy interactions_all on public.interactions for all to authenticated
  using ((scope = 'gavia' and public.platform_can('crm')) or (scope = 'balneario' and public.is_member(balneario_id)))
  with check ((scope = 'gavia' and public.platform_can('crm')) or (scope = 'balneario' and public.is_member(balneario_id)));

drop policy if exists reminders_all on public.reminders;
create policy reminders_all on public.reminders for all to authenticated
  using ((scope = 'gavia' and (public.platform_can('calendario') or public.platform_can('crm'))) or (scope = 'balneario' and public.is_member(balneario_id)))
  with check ((scope = 'gavia' and (public.platform_can('calendario') or public.platform_can('crm'))) or (scope = 'balneario' and public.is_member(balneario_id)));
-- Supervisión: GAVIA puede consultar (no modificar) la agenda de un balneario.
create policy reminders_supervision on public.reminders for select to authenticated
  using (scope = 'balneario' and public.is_superadmin());

drop policy if exists calendar_events_all on public.calendar_events;
create policy calendar_events_all on public.calendar_events for all to authenticated
  using ((scope = 'gavia' and public.platform_can('calendario')) or (scope = 'balneario' and public.is_member(balneario_id)))
  with check ((scope = 'gavia' and public.platform_can('calendario')) or (scope = 'balneario' and public.is_member(balneario_id)));
create policy calendar_events_supervision on public.calendar_events for select to authenticated
  using (scope = 'balneario' and public.is_superadmin());

drop policy if exists conversations_all on public.conversations;
create policy conversations_all on public.conversations for all to authenticated
  using ((scope = 'gavia' and public.platform_can('conversaciones'))
         or (scope = 'balneario' and public.is_member(balneario_id) and public.has_module(balneario_id, 'whatsapp')))
  with check ((scope = 'gavia' and public.platform_can('conversaciones'))
              or (scope = 'balneario' and public.is_member(balneario_id) and public.has_module(balneario_id, 'whatsapp')));

drop policy if exists audit_read on public.audit_log;
create policy audit_read on public.audit_log for select to authenticated
  using (public.platform_can('auditoria') or (balneario_id is not null and public.is_owner(balneario_id)));

-- ---------------------------------------------------------------------
-- Confidencialidad: GAVIA no accede a cobros ni a resúmenes financieros
-- de los balnearios (los gastos ya eran exclusivos del dueño).
-- ---------------------------------------------------------------------
drop policy if exists payments_read on public.payments;
create policy payments_read on public.payments for select to authenticated
  using (public.is_owner(balneario_id)
         or (public.is_member(balneario_id) and exists (
           select 1 from public.reservations r where r.id = reservation_id and public.in_admin_window(r.end_date))));

drop policy if exists payment_requests_read on public.payment_requests;
create policy payment_requests_read on public.payment_requests for select to authenticated
  using (public.is_member(balneario_id));

create or replace function public.finance_summary(p_balneario uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_owner(p_balneario) then
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

-- ---------------------------------------------------------------------
-- Etapas comerciales: TESTING (prueba de 15 días), ACTIVO y SUSPENDIDO.
-- ---------------------------------------------------------------------
update public.balnearios set status = 'suspendido' where status = 'baja';
alter table public.balnearios drop constraint if exists balnearios_status_check;
alter table public.balnearios add constraint balnearios_status_check check (status in ('prueba', 'activo', 'suspendido'));

-- Acceso de un miembro a su balneario: 'ok', 'prueba' (con fecha de fin), 'prueba_vencida' o 'suspendido'.
create or replace function public.balneario_access(p_balneario uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select case
    when not public.is_member(p_balneario) then null
    else (
      select jsonb_build_object(
        'estado', case
          when b.status = 'suspendido' then 'suspendido'
          when b.status = 'prueba' and coalesce(s.current_period_end, current_date) < current_date then 'prueba_vencida'
          when b.status = 'prueba' then 'prueba'
          else 'ok' end,
        'fin_prueba', case when b.status = 'prueba' then s.current_period_end end)
      from public.balnearios b
      left join lateral (select current_period_end from public.subscriptions
                          where balneario_id = b.id order by created_at desc limit 1) s on true
      where b.id = p_balneario)
  end;
$$;

-- ---------------------------------------------------------------------
-- Precios en dólares y facturación en cuotas
-- ---------------------------------------------------------------------
alter table public.plans add column if not exists currency text not null default 'USD' check (currency in ('USD', 'ARS'));
update public.plans set price_cents = 39900, currency = 'USD' where code = 'start';
update public.plans set price_cents = 89900, currency = 'USD' where code = 'pro';
update public.plans set price_cents = 129900, currency = 'USD' where code = 'plus';

alter table public.subscriptions add column if not exists currency text not null default 'USD' check (currency in ('USD', 'ARS'));
alter table public.gavia_invoices add column if not exists currency text not null default 'USD' check (currency in ('USD', 'ARS'));
alter table public.gavia_invoices add column if not exists installment_no integer check (installment_no is null or installment_no > 0);
alter table public.gavia_invoices add column if not exists installments integer check (installments is null or installments > 0);
alter table public.gavia_payments add column if not exists currency text not null default 'USD' check (currency in ('USD', 'ARS'));

-- ---------------------------------------------------------------------
-- Agenda pública de demos (turnos de 30 minutos)
-- ---------------------------------------------------------------------
create table public.demo_bookings (
  id uuid primary key default gen_random_uuid(),
  starts_at timestamptz not null,
  name text not null check (length(name) between 2 and 100),
  business_name text not null default '',
  email text not null,
  phone text not null default '',
  city text not null default '',
  notes text not null default '',
  lead_id uuid references public.leads(id) on delete set null,
  event_id uuid references public.calendar_events(id) on delete set null,
  status text not null default 'agendada' check (status in ('agendada', 'realizada', 'cancelada')),
  created_at timestamptz not null default now()
);
-- Un turno no puede reservarse dos veces.
create unique index demo_bookings_slot_idx on public.demo_bookings (starts_at) where status <> 'cancelada';
alter table public.demo_bookings enable row level security;
create policy demo_bookings_gavia on public.demo_bookings for all to authenticated
  using (public.platform_can('calendario') or public.platform_can('crm'))
  with check (public.platform_can('calendario') or public.platform_can('crm'));
grant select, insert, update, delete on public.demo_bookings to authenticated;
create trigger audit_demo_bookings after insert or update on public.demo_bookings for each row execute function public.audit_trigger();
