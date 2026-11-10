import "server-only";
import type { Db } from "@/server/db";
import { addDays, addMonths, daysBetweenInclusive, formatDate, monthLabel, startOfMonth, startOfWeek } from "@/lib/dates";

export type FinanceSummary = {
  facturacion: number;
  cobros: number;
  saldo_pendiente: number;
  por_medio: Record<string, number>;
  por_mes: { mes: string; facturacion: number; cobros: number }[];
};

/** Solo dueños/superadmin: la función SQL rechaza al administrador. */
export async function financeSummary(db: Db, balnearioId: string, from: string, to: string): Promise<FinanceSummary> {
  const r = await db.one<{ s: FinanceSummary }>(`select finance_summary($1, $2, $3) as s`, [balnearioId, from, to]);
  return r!.s;
}

/** Ocupación = días-unidad reservados / días-unidad disponibles (excluye fuera de servicio). */
export async function occupancy(db: Db, balnearioId: string, from: string, to: string) {
  const r = await db.one<{ used: number; capacity: number }>(
    `with u as (select id from units where balneario_id = $1 and not out_of_service),
          d as (select generate_series($2::date, $3::date, interval '1 day')::date as day)
     select (select count(*) from u cross join d
              where exists (select 1 from reservation_units ru join reservations r on r.id = ru.reservation_id
                            where ru.unit_id = u.id and ru.active and r.status in ('confirmada', 'finalizada') and ru.period @> d.day))::int as used,
            ((select count(*) from u) * (select count(*) from d))::int as capacity`,
    [balnearioId, from, to],
  );
  return { used: r?.used ?? 0, capacity: r?.capacity ?? 0, pct: r && r.capacity ? Math.round((r.used / r.capacity) * 1000) / 10 : 0 };
}

export async function operationalSnapshot(db: Db, balnearioId: string, today: string) {
  const [counts, moves, unread] = await Promise.all([
    db.one<{ today: number; active: number; free_today: number; total_units: number; to_collect: number }>(
      `select
         (select count(*) from reservations where balneario_id = $1 and status in ('pendiente', 'confirmada') and $2::date between start_date and end_date)::int as today,
         (select count(*) from reservations where balneario_id = $1 and status in ('pendiente', 'confirmada') and end_date >= $2::date)::int as active,
         (select count(*) from units u where u.balneario_id = $1 and not u.out_of_service and not exists (
            select 1 from reservation_units ru where ru.unit_id = u.id and ru.active and ru.period @> $2::date))::int as free_today,
         (select count(*) from units where balneario_id = $1)::int as total_units,
         (select count(*) from reservations where balneario_id = $1 and status in ('pendiente', 'confirmada') and balance_cents > 0
            and end_date >= $2::date - 30)::int as to_collect`,
      [balnearioId, today],
    ),
    db.many<{ id: string; type: "ingreso" | "salida"; day: string; customer: string; units: string; number: number }>(
      `select r.id, 'ingreso' as type, r.start_date as day, trim(c.first_name || ' ' || c.last_name) as customer, r.number,
              coalesce((select string_agg(u.code, ', ') from reservation_units ru join units u on u.id = ru.unit_id where ru.reservation_id = r.id), '') as units
         from reservations r join customers c on c.id = r.customer_id
        where r.balneario_id = $1 and r.status in ('pendiente', 'confirmada') and r.start_date between $2::date and $2::date + 7
       union all
       select r.id, 'salida', r.end_date, trim(c.first_name || ' ' || c.last_name), r.number,
              coalesce((select string_agg(u.code, ', ') from reservation_units ru join units u on u.id = ru.unit_id where ru.reservation_id = r.id), '')
         from reservations r join customers c on c.id = r.customer_id
        where r.balneario_id = $1 and r.status in ('pendiente', 'confirmada') and r.end_date between $2::date and $2::date + 7
       order by day limit 12`,
      [balnearioId, today],
    ),
    db.one<{ n: number }>(`select coalesce(sum(unread_count), 0)::int as n from conversations where balneario_id = $1 and status <> 'cerrada'`, [balnearioId]),
  ]);
  return { ...counts!, moves, unread: unread?.n ?? 0 };
}

export async function chargesToManage(db: Db, balnearioId: string, today: string) {
  return db.many<{ id: string; number: number; customer: string; start_date: string; end_date: string; balance_cents: number; units: string }>(
    `select r.id, r.number, trim(c.first_name || ' ' || c.last_name) as customer, r.start_date, r.end_date, r.balance_cents,
            coalesce((select string_agg(u.code, ', ') from reservation_units ru join units u on u.id = ru.unit_id where ru.reservation_id = r.id), '') as units
       from reservations r join customers c on c.id = r.customer_id
      where r.balneario_id = $1 and r.status in ('pendiente', 'confirmada') and r.balance_cents > 0 and r.end_date >= $2::date - 30
      -- El cobro vence al terminar el período reservado: primero los más próximos a vencer.
      order by r.end_date, r.start_date limit 50`,
    [balnearioId, today],
  );
}

/**
 * Ingresos y gastos agrupados por semana (rangos cortos) o por mes.
 * Ingresos: cobros aprobados por fecha de cobro (plan con pagos) o, sin ese módulo,
 * el total de las reservas por fecha de inicio.
 */
export async function incomeVsExpenses(db: Db, balnearioId: string, from: string, to: string, source: "cobros" | "ventas") {
  const income = await db.many<{ d: string; s: number }>(
    source === "cobros"
      ? `select local_date(paid_at)::text as d, sum(amount_cents)::bigint as s from payments
          where balneario_id = $1 and status = 'aprobado' and local_date(paid_at) between $2 and $3 group by 1`
      : `select start_date::text as d, sum(total_cents)::bigint as s from reservations
          where balneario_id = $1 and status <> 'cancelada' and start_date between $2 and $3 group by 1`,
    [balnearioId, from, to],
  );
  const expense = await db.many<{ d: string; s: number }>(
    `select spent_on::text as d, sum(amount_cents)::bigint as s from expenses where balneario_id = $1 and spent_on between $2 and $3 group by 1`,
    [balnearioId, from, to],
  );
  const monthly = daysBetweenInclusive(from, to) > 62;
  const buckets: { key: string; end: string; label: string; income: number; expense: number }[] = [];
  if (monthly) {
    for (let m = startOfMonth(from); m <= to && buckets.length < 24; m = addMonths(m, 1)) {
      buckets.push({ key: m, end: addDays(addMonths(m, 1), -1), label: monthLabel(m).replace(/ de \d{4}/, ""), income: 0, expense: 0 });
    }
  } else {
    for (let w = startOfWeek(from); w <= to && buckets.length < 12; w = addDays(w, 7)) {
      buckets.push({ key: w, end: addDays(w, 6), label: formatDate(w, { day: "2-digit", month: "2-digit" }), income: 0, expense: 0 });
    }
  }
  const put = (d: string, v: number, k: "income" | "expense") => {
    const b = buckets.find((x) => d >= x.key && d <= x.end);
    if (b) b[k] += Number(v);
  };
  for (const r of income) put(r.d, r.s, "income");
  for (const r of expense) put(r.d, r.s, "expense");
  return {
    monthly,
    buckets,
    income: income.reduce((s, r) => s + Number(r.s), 0),
    expense: expense.reduce((s, r) => s + Number(r.s), 0),
  };
}