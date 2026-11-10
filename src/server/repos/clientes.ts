import "server-only";
import type { Db } from "@/server/db";
import type { TenantRole } from "@/server/auth/context";

export async function listCustomers(db: Db, balnearioId: string, f: { q?: string; saldo?: boolean }) {
  return db.many<{ id: string; name: string; phone: string; email: string; reservations: number; balance_cents: number; last_start: string | null; is_demo: boolean }>(
    `select c.id, trim(c.first_name || ' ' || c.last_name) as name, coalesce(nullif(c.whatsapp, ''), c.phone) as phone, c.email, c.is_demo,
            count(r.id) filter (where r.status <> 'cancelada')::int as reservations,
            coalesce(sum(r.balance_cents) filter (where r.status <> 'cancelada'), 0) as balance_cents,
            max(r.start_date) filter (where r.status <> 'cancelada') as last_start
       from customers c left join reservations r on r.customer_id = c.id
      where c.balneario_id = $1
        and ($2::text is null or (c.first_name || ' ' || c.last_name) ilike '%' || $2 || '%' or c.phone ilike '%' || $2 || '%'
             or c.whatsapp ilike '%' || $2 || '%' or c.email ilike '%' || $2 || '%')
      group by c.id
     having (not $3 or coalesce(sum(r.balance_cents) filter (where r.status <> 'cancelada'), 0) > 0)
      order by c.last_name, c.first_name
      limit 300`,
    [balnearioId, f.q?.trim() || null, !!f.saldo],
  );
}

/** Ficha del cliente. El administrador no recibe documento ni domicilio. */
export async function getCustomer(db: Db, balnearioId: string, id: string, role: TenantRole) {
  const c = await db.one<{ id: string; first_name: string; last_name: string; phone: string; whatsapp: string; email: string; document_id: string; address: string; notes: string; is_demo: boolean; created_at: string }>(
    `select id, first_name, last_name, phone, whatsapp, email,
            case when $3 = 'owner' then document_id else '' end as document_id,
            case when $3 = 'owner' then address else '' end as address,
            notes, is_demo, created_at
       from customers where balneario_id = $1 and id = $2`,
    [balnearioId, id, role],
  );
  if (!c) return null;
  const reservations = await db.many<{ id: string; number: number; start_date: string; end_date: string; status: string; total_cents: number; paid_cents: number; balance_cents: number; units: string }>(
    `select r.id, r.number, r.start_date, r.end_date, r.status, r.total_cents, r.paid_cents, r.balance_cents,
            coalesce((select string_agg(u.code, ', ' order by u.code) from reservation_units ru join units u on u.id = ru.unit_id where ru.reservation_id = r.id), '') as units
       from reservations r
      where r.customer_id = $1 or exists (select 1 from reservation_customers rc where rc.reservation_id = r.id and rc.customer_id = $1)
      order by r.start_date desc`,
    [id],
  );
  const payments = await db.many<{ id: string; amount_cents: number; method: string; status: string; paid_at: string; number: number }>(
    `select p.id, p.amount_cents, p.method, p.status, p.paid_at, r.number from payments p join reservations r on r.id = p.reservation_id
      where r.customer_id = $1 or exists (select 1 from reservation_customers rc where rc.reservation_id = r.id and rc.customer_id = $1)
      order by p.paid_at desc`,
    [id],
  );
  const interactions = await db.many<{ id: string; kind: string; summary: string; occurred_at: string; author: string | null }>(
    `select i.id, i.kind, i.summary, i.occurred_at, p.full_name as author from interactions i left join profiles p on p.id = i.created_by
      where i.customer_id = $1 order by i.occurred_at desc limit 50`,
    [id],
  );
  const conversations = await db.many<{ id: string; status: string; last_message_at: string | null }>(
    `select id, status, last_message_at from conversations where customer_id = $1 order by last_message_at desc nulls last`,
    [id],
  );
  return { ...c, reservations, payments, interactions, conversations };
}
