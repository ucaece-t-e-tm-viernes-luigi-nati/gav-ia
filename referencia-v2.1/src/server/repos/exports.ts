import "server-only";
import type { Db } from "@/server/db";

export type PaymentRow = {
  id: string; paid_at: string; amount_cents: number; method: string; status: string; provider_payment_id: string | null;
  invoiced: boolean; invoice_ref: string; number: number; reservation_id: string; customer_id: string; customer: string; author: string | null;
};

/** Cobros del balneario en un rango (la RLS limita la lectura al dueño o a la ventana del administrador). */
export function listPayments(db: Db, balnearioId: string, f: { from: string; to: string; method?: string | null; invoiced?: "si" | "no" | null }) {
  return db.many<PaymentRow>(
    `select p.id, p.paid_at, p.amount_cents, p.method, p.status, p.provider_payment_id, p.invoiced, p.invoice_ref,
            r.number, r.id as reservation_id, c.id as customer_id, coalesce(reservation_holders(r.id), trim(c.first_name || ' ' || c.last_name)) as customer, pr.full_name as author
       from payments p join reservations r on r.id = p.reservation_id join customers c on c.id = r.customer_id left join profiles pr on pr.id = p.created_by
      where p.balneario_id = $1 and local_date(p.paid_at) between $2 and $3 and ($4::text is null or p.method = $4)
        and ($5::text is null or p.invoiced = ($5 = 'si'))
      order by p.paid_at desc limit 5000`,
    [balnearioId, f.from, f.to, f.method || null, f.invoiced || null],
  );
}

export type ExpenseRow = { id: string; spent_on: string; amount_cents: number; description: string; payment_method: string; category: string; category_id: string; author: string | null; employee: string | null };

export function listExpenses(db: Db, balnearioId: string, f: { from: string; to: string; categoryId?: string | null }) {
  return db.many<ExpenseRow>(
    `select e.id, e.spent_on, e.amount_cents, e.description, e.payment_method, c.name as category, c.id as category_id, p.full_name as author, em.full_name as employee
       from expenses e join expense_categories c on c.id = e.category_id left join profiles p on p.id = e.created_by left join employees em on em.id = e.employee_id
      where e.balneario_id = $1 and e.spent_on between $2 and $3 and ($4::uuid is null or e.category_id = $4)
      order by e.spent_on desc, e.created_at desc limit 5000`,
    [balnearioId, f.from, f.to, f.categoryId || null],
  );
}

export type SaleRow = { id: string; number: number; start_date: string; end_date: string; total_cents: number; status: string; customer: string; units: string };

/** Reservas (ventas) por fecha de inicio, para balnearios sin el módulo de pagos. */
export function listSales(db: Db, balnearioId: string, f: { from: string; to: string }) {
  return db.many<SaleRow>(
    `select r.id, r.number, r.start_date, r.end_date, r.total_cents, r.status, coalesce(reservation_holders(r.id), '') as customer,
            coalesce((select string_agg(u.code, ', ' order by u.code) from reservation_units ru join units u on u.id = ru.unit_id where ru.reservation_id = r.id), '') as units
       from reservations r where r.balneario_id = $1 and r.status <> 'cancelada' and r.start_date between $2 and $3
      order by r.start_date desc limit 5000`,
    [balnearioId, f.from, f.to],
  );
}