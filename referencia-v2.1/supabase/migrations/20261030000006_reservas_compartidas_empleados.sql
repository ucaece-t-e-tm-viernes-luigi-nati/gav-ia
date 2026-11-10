-- =====================================================================
-- Eliminar reservas (el cliente se conserva), carpas compartidas por dos
-- clientes, empleados y categoría de gastos "Sueldos" predeterminada.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Eliminar reservas: solo sin cobros (los cobros impiden borrar por la FK
-- "on delete restrict"; con cobros se cancela). El cliente no se borra.
-- ---------------------------------------------------------------------
drop policy if exists reservations_delete on public.reservations;
create policy reservations_delete on public.reservations for delete to authenticated
  using (public.can_read_reservation(balneario_id, end_date) and public.is_member(balneario_id));
grant delete on public.reservations to authenticated;
create trigger audit_reservations_delete after delete on public.reservations for each row execute function public.audit_trigger();

-- ---------------------------------------------------------------------
-- Carpa compartida: clientes adicionales (cotitulares) de una reserva.
-- El titular sigue en reservations.customer_id.
-- ---------------------------------------------------------------------
create table public.reservation_customers (
  reservation_id uuid not null,
  balneario_id uuid not null,
  customer_id uuid not null,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (reservation_id, customer_id),
  foreign key (reservation_id, balneario_id) references public.reservations(id, balneario_id) on delete cascade,
  foreign key (customer_id, balneario_id) references public.customers(id, balneario_id) on delete cascade
);
create index reservation_customers_customer_idx on public.reservation_customers (customer_id);

-- El cotitular no puede ser el mismo titular.
create or replace function public.guard_reservation_customer() returns trigger
language plpgsql set search_path = public as $$
begin
  if exists (select 1 from public.reservations where id = new.reservation_id and customer_id = new.customer_id) then
    raise exception 'Ese cliente ya es el titular de la reserva' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger reservation_customers_guard before insert or update on public.reservation_customers
  for each row execute function public.guard_reservation_customer();

alter table public.reservation_customers enable row level security;
create policy reservation_customers_read on public.reservation_customers for select to authenticated
  using (exists (select 1 from public.reservations r where r.id = reservation_id));
create policy reservation_customers_write on public.reservation_customers for insert to authenticated
  with check (public.is_member(balneario_id) and exists (select 1 from public.reservations r where r.id = reservation_id and r.balneario_id = balneario_id));
create policy reservation_customers_delete on public.reservation_customers for delete to authenticated
  using (public.is_member(balneario_id) and exists (select 1 from public.reservations r where r.id = reservation_id));
grant select, insert, delete on public.reservation_customers to authenticated;
create trigger audit_reservation_customers after insert or delete on public.reservation_customers for each row execute function public.audit_trigger();

-- Nombres de los titulares de una reserva ("Ana Pérez y Juan Gómez"). Respeta RLS (security invoker).
create or replace function public.reservation_holders(p_reservation uuid) returns text
language sql stable set search_path = public as $$
  select string_agg(nullif(trim(c.first_name || ' ' || c.last_name), ''), ' y ' order by x.ord, x.at)
    from (select r.customer_id as cid, 0 as ord, r.created_at as at from public.reservations r where r.id = p_reservation
          union all
          select rc.customer_id, 1, rc.created_at from public.reservation_customers rc where rc.reservation_id = p_reservation) x
    join public.customers c on c.id = x.cid;
$$;
grant execute on function public.reservation_holders(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Empleados (para registrar sueldos). Solo el dueño, como los gastos.
-- ---------------------------------------------------------------------
create table public.employees (
  id uuid primary key default gen_random_uuid(),
  balneario_id uuid not null references public.balnearios(id) on delete cascade,
  full_name text not null check (length(full_name) between 2 and 100),
  phone text not null default '' check (length(phone) <= 40),
  bank text not null default '' check (length(bank) <= 80),
  account_holder text not null default '' check (length(account_holder) <= 100),
  cbu text not null default '' check (cbu = '' or cbu ~ '^[0-9]{22}$'),
  alias text not null default '' check (length(alias) <= 40),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (id, balneario_id)
);
alter table public.employees enable row level security;
create policy employees_owner on public.employees for all to authenticated
  using (public.is_owner(balneario_id)) with check (public.is_owner(balneario_id));
grant select, insert, update, delete on public.employees to authenticated;
create trigger audit_employees after insert or update or delete on public.employees for each row execute function public.audit_trigger();

alter table public.expenses add column if not exists employee_id uuid;
alter table public.expenses add constraint expenses_employee_fk
  foreign key (employee_id, balneario_id) references public.employees(id, balneario_id) on delete restrict;
create index if not exists expenses_employee_idx on public.expenses (employee_id) where employee_id is not null;

-- ---------------------------------------------------------------------
-- Categoría "Sueldos" predeterminada en cada balneario (no se puede borrar).
-- ---------------------------------------------------------------------
alter table public.expense_categories add column if not exists kind text not null default 'general' check (kind in ('general', 'sueldos'));
update public.expense_categories set kind = 'sueldos' where lower(name) = 'sueldos';
insert into public.expense_categories (balneario_id, name, kind)
  select b.id, 'Sueldos', 'sueldos' from public.balnearios b
   where not exists (select 1 from public.expense_categories c where c.balneario_id = b.id and c.kind = 'sueldos');
create unique index if not exists expense_categories_sueldos_idx on public.expense_categories (balneario_id) where kind = 'sueldos';

create or replace function public.create_default_expense_categories() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.expense_categories (balneario_id, name, kind) values (new.id, 'Sueldos', 'sueldos')
  on conflict do nothing;
  return new;
end $$;
create trigger balnearios_default_categories after insert on public.balnearios
  for each row execute function public.create_default_expense_categories();

create or replace function public.guard_expense_category() returns trigger
language plpgsql set search_path = public as $$
begin
  if old.kind = 'sueldos' and (tg_op = 'DELETE' or new.kind <> 'sueldos') then
    -- Se permite al eliminar el balneario completo (borrado en cascada).
    if exists (select 1 from public.balnearios where id = old.balneario_id) then
      raise exception 'La categoría Sueldos es predeterminada y no se puede eliminar' using errcode = '23514';
    end if;
  end if;
  return coalesce(new, old);
end $$;
create trigger expense_categories_guard before update or delete on public.expense_categories
  for each row execute function public.guard_expense_category();

-- Un gasto con empleado debe ser de la categoría Sueldos.
create or replace function public.guard_expense_employee() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.employee_id is not null and not exists (
       select 1 from public.expense_categories where id = new.category_id and kind = 'sueldos') then
    raise exception 'Solo los gastos de la categoría Sueldos se asignan a un empleado' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger expenses_employee_guard before insert or update on public.expenses
  for each row execute function public.guard_expense_employee();
