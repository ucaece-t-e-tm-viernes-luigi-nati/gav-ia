-- =====================================================================
-- Varios dueños por balneario, teléfono de contacto de usuarios, marca de
-- "facturado" en cobros, planes anuales y suspensión automática cuando no
-- se renueva el plan de GAVIA.
-- =====================================================================

-- Teléfono de contacto (lo consulta GAVIA desde el backoffice).
alter table public.profiles add column if not exists phone text not null default '' check (length(phone) <= 40);

-- ---------------------------------------------------------------------
-- El dueño gestiona dueños y administradores de su balneario
-- ---------------------------------------------------------------------
drop policy if exists memberships_insert on public.memberships;
create policy memberships_insert on public.memberships for insert to authenticated
  with check (public.is_superadmin() or public.is_owner(balneario_id));
drop policy if exists memberships_update on public.memberships;
create policy memberships_update on public.memberships for update to authenticated
  using (public.is_superadmin() or public.is_owner(balneario_id))
  with check (public.is_superadmin() or public.is_owner(balneario_id));
drop policy if exists memberships_delete on public.memberships;
create policy memberships_delete on public.memberships for delete to authenticated
  using (public.is_superadmin() or public.is_owner(balneario_id));

-- Un balneario nunca puede quedar sin al menos un dueño activo.
create or replace function public.guard_last_owner() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_balneario uuid := coalesce(old.balneario_id, new.balneario_id);
begin
  if not exists (select 1 from public.memberships where balneario_id = v_balneario and role = 'owner' and active)
     and exists (select 1 from public.balnearios where id = v_balneario) then
    raise exception 'El balneario debe tener al menos un dueño activo' using errcode = '23514';
  end if;
  return null;
end $$;
create trigger memberships_last_owner after update or delete on public.memberships
  for each row execute function public.guard_last_owner();

-- ---------------------------------------------------------------------
-- Cobros: marca de facturado (comprobante emitido al cliente)
-- ---------------------------------------------------------------------
alter table public.payments add column if not exists invoiced boolean not null default false;
alter table public.payments add column if not exists invoice_ref text not null default '' check (length(invoice_ref) <= 60);
alter table public.payments add column if not exists invoiced_at timestamptz;
create index if not exists payments_invoiced_idx on public.payments (balneario_id, invoiced);

-- ---------------------------------------------------------------------
-- Planes anuales y vencimiento de la suscripción
-- ---------------------------------------------------------------------
update public.plans set billing_period = 'anual' where code in ('start', 'pro', 'plus');

-- Acceso: un balneario ACTIVO cuyo período pagado terminó queda sin acceso ("sin_renovar").
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
          when b.status = 'activo' and s.current_period_end is not null and s.current_period_end < current_date then 'sin_renovar'
          else 'ok' end,
        'fin_prueba', case when b.status = 'prueba' then s.current_period_end end)
      from public.balnearios b
      left join lateral (select current_period_end from public.subscriptions
                          where balneario_id = b.id order by created_at desc limit 1) s on true
      where b.id = p_balneario)
  end;
$$;

-- Tarea diaria: pasa a SUSPENDIDO los balnearios activos que no renovaron.
create or replace function public.suspend_unrenewed_balnearios() returns integer
language plpgsql security definer set search_path = public as $$
declare v_count integer := 0; r record;
begin
  for r in
    select b.id from public.balnearios b
    join lateral (select id, current_period_end from public.subscriptions where balneario_id = b.id order by created_at desc limit 1) s on true
    where b.status = 'activo' and s.current_period_end < current_date
  loop
    update public.balnearios set status = 'suspendido' where id = r.id;
    update public.subscriptions set status = 'vencida'
     where id = (select id from public.subscriptions where balneario_id = r.id order by created_at desc limit 1);
    insert into public.audit_log (balneario_id, action, entity, entity_id, data)
    values (r.id, 'balnearios.suspendido_sin_renovacion', 'balnearios', r.id::text, '{}');
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;
revoke execute on function public.suspend_unrenewed_balnearios() from public, anon, authenticated;
