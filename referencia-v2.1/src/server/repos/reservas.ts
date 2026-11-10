import "server-only";
import type { Db } from "@/server/db";

export type ReservationStatus = "pendiente" | "confirmada" | "cancelada" | "finalizada";

export type ReservationRow = {
  id: string;
  number: number;
  start_date: string;
  end_date: string;
  status: ReservationStatus;
  total_cents: number;
  paid_cents: number;
  balance_cents: number;
  customer_id: string;
  customer_name: string;
  units: string;
  created_at: string;
  is_demo: boolean;
};

export async function listReservations(
  db: Db,
  balnearioId: string,
  f: { q?: string; status?: string; from?: string; to?: string; withBalance?: boolean; limit?: number } = {},
) {
  return db.many<ReservationRow>(
    `select r.id, r.number, r.start_date, r.end_date, r.status, r.total_cents, r.paid_cents, r.balance_cents, r.created_at, r.is_demo,
            c.id as customer_id, coalesce(reservation_holders(r.id), trim(c.first_name || ' ' || c.last_name)) as customer_name,
            coalesce((select string_agg(u.code, ', ' order by u.code) from reservation_units ru join units u on u.id = ru.unit_id
                       where ru.reservation_id = r.id), '') as units
       from reservations r join customers c on c.id = r.customer_id
      where r.balneario_id = $1
        and ($2::text is null or r.status = $2)
        and ($3::date is null or r.end_date >= $3)
        and ($4::date is null or r.start_date <= $4)
        and ($5::text is null or (c.first_name || ' ' || c.last_name) ilike '%' || $5 || '%' or r.number::text = $5
             or exists (select 1 from reservation_customers rc join customers c2 on c2.id = rc.customer_id
                         where rc.reservation_id = r.id and (c2.first_name || ' ' || c2.last_name) ilike '%' || $5 || '%')
             or exists (select 1 from reservation_units ru join units u on u.id = ru.unit_id where ru.reservation_id = r.id and u.code ilike '%' || $5 || '%'))
        and (not $6 or (r.balance_cents > 0 and r.status <> 'cancelada'))
      order by r.start_date desc, r.number desc
      limit $7`,
    [balnearioId, f.status || null, f.from || null, f.to || null, f.q?.trim() || null, !!f.withBalance, f.limit ?? 200],
  );
}

export async function getReservation(db: Db, balnearioId: string, id: string) {
  const r = await db.one<ReservationRow & { titular_name: string; notes: string; cancel_reason: string | null; cancelled_at: string | null; created_by_name: string | null; customer_phone: string; customer_email: string }>(
    `select r.id, r.number, r.start_date, r.end_date, r.status, r.total_cents, r.paid_cents, r.balance_cents, r.created_at, r.is_demo,
            r.notes, r.cancel_reason, r.cancelled_at,
            c.id as customer_id, coalesce(reservation_holders(r.id), trim(c.first_name || ' ' || c.last_name)) as customer_name,
            trim(c.first_name || ' ' || c.last_name) as titular_name,
            coalesce(nullif(c.whatsapp, ''), c.phone) as customer_phone, c.email as customer_email,
            p.full_name as created_by_name, '' as units
       from reservations r join customers c on c.id = r.customer_id left join profiles p on p.id = r.created_by
      where r.balneario_id = $1 and r.id = $2`,
    [balnearioId, id],
  );
  if (!r) return null;
  const units = await db.many<{ id: string; code: string; kind: string; map: string }>(
    `select u.id, u.code, u.kind, u.map from reservation_units ru join units u on u.id = ru.unit_id where ru.reservation_id = $1 order by u.code`,
    [id],
  );
  const payments = await db.many<{
    id: string; amount_cents: number; method: string; status: string; paid_at: string; provider_payment_id: string | null;
    notes: string; created_by_name: string | null; void_reason: string | null;
  }>(
    `select p.id, p.amount_cents, p.method, p.status, p.paid_at, p.provider_payment_id, p.notes, p.void_reason, pr.full_name as created_by_name
       from payments p left join profiles pr on pr.id = p.created_by
      where p.reservation_id = $1 order by p.paid_at desc`,
    [id],
  );
  const requests = await db.many<{ id: string; amount_cents: number; mode: string; status: string; created_at: string; status_detail: string }>(
    `select id, amount_cents, mode, status, created_at, status_detail from payment_requests where reservation_id = $1 order by created_at desc limit 10`,
    [id],
  );
  // Carpa compartida: clientes adicionales además del titular.
  const coHolders = await db.many<{ id: string; name: string; phone: string }>(
    `select c.id, trim(c.first_name || ' ' || c.last_name) as name, coalesce(nullif(c.whatsapp, ''), c.phone) as phone
       from reservation_customers rc join customers c on c.id = rc.customer_id where rc.reservation_id = $1 order by rc.created_at`,
    [id],
  );
  const audit = await db.many<{ id: number; action: string; data: Record<string, unknown>; created_at: string; actor: string | null }>(
    `select a.id, a.action, a.data, a.created_at, p.full_name as actor from audit_log a left join profiles p on p.id = a.actor_id
      where a.entity in ('reservations', 'payments') and (a.entity_id = $1 or a.data -> 'nuevo' ->> 'reservation_id' = $1)
      order by a.created_at desc limit 30`,
    [id],
  );
  return { ...r, unitList: units, payments, requests, audit, coHolders };
}

export async function createReservation(
  db: Db,
  balnearioId: string,
  input: {
    customerId: string; unitIds: string[]; startDate: string; endDate: string; totalCents: number; status: "pendiente" | "confirmada";
    notes: string; payment?: { amountCents: number; method: string } | null;
    /** Clientes que comparten la carpa con el titular. */
    coCustomerIds?: string[];
  },
) {
  const r = await db.one<{ id: string; number: number }>(
    `insert into reservations (balneario_id, customer_id, start_date, end_date, total_cents, status, notes, created_by)
     values ($1, $2, $3, $4, $5, $6, $7, auth.uid()) returning id, number`,
    [balnearioId, input.customerId, input.startDate, input.endDate, input.totalCents, input.status, input.notes],
  );
  for (const unitId of input.unitIds) {
    await db.exec(`insert into reservation_units (reservation_id, unit_id, balneario_id, period) values ($1, $2, $3, 'empty')`, [r!.id, unitId, balnearioId]);
  }
  for (const customerId of input.coCustomerIds ?? []) {
    await db.exec(`insert into reservation_customers (reservation_id, balneario_id, customer_id) values ($1, $2, $3)`, [r!.id, balnearioId, customerId]);
  }
  if (input.payment && input.payment.amountCents > 0) {
    await insertManualPayment(db, balnearioId, r!.id, input.payment.amountCents, input.payment.method, "Pago registrado al crear la reserva");
  }
  return r!;
}

export async function insertManualPayment(db: Db, balnearioId: string, reservationId: string, amountCents: number, method: string, notes: string) {
  await db.exec(
    `insert into payments (balneario_id, reservation_id, amount_cents, method, notes, created_by)
     values ($1, $2, $3, $4, $5, auth.uid())`,
    [balnearioId, reservationId, amountCents, method, notes],
  );
}

export async function listCustomerOptions(db: Db, balnearioId: string, q: string) {
  return db.many<{ id: string; name: string; phone: string; email: string }>(
    `select id, trim(first_name || ' ' || last_name) as name, coalesce(nullif(whatsapp, ''), phone) as phone, email
       from customers where balneario_id = $1
        and ((first_name || ' ' || last_name) ilike '%' || $2 || '%' or phone ilike '%' || $2 || '%' or whatsapp ilike '%' || $2 || '%' or email ilike '%' || $2 || '%')
      order by last_name, first_name limit 8`,
    [balnearioId, q],
  );
}
