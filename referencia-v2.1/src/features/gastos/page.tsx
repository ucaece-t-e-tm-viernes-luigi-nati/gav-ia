import Link from "next/link";
import { Coins } from "lucide-react";
import { Card, CardBody, CardHeader, EmptyState, PageHeader, Stat, Table, Td, Th } from "@/components/ui/primitives";
import { BarGroups, HBar } from "@/components/ui/charts";
import { ActionButton, QuickForm } from "@/components/ui/quick-form";
import { requireTenant } from "@/server/auth/context";
import { asUser } from "@/server/db";
import { createCategoryAction, createExpenseAction, deleteExpenseAction } from "@/server/actions/gastos";
import { formatMoney } from "@/lib/money";
import { addDays, addMonths, daysBetweenInclusive, endOfMonth, formatDate, isISODate, monthLabel, startOfMonth, startOfWeek, todayISO } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { METHOD_LABEL } from "@/features/reservas/labels";
import { CategoryRow } from "./categories";
import { EmployeesCard, type Employee } from "./employees";
import { ExportButtons } from "@/features/owner/pages";

type Search = Promise<{ desde?: string; hasta?: string; categoria?: string }>;

export async function GastosPage({ searchParams }: { searchParams: Search }) {
  const t = await requireTenant("owner");
  const sp = await searchParams;
  const today = todayISO();
  const season = await asUser(t.viewer.id, (db) =>
    db.one<{ season_start: string | null; season_end: string | null }>(`select season_start, season_end from balnearios where id = $1`, [t.balnearioId]),
  );
  const presets = [
    { label: "Esta semana", from: startOfWeek(today), to: addDays(startOfWeek(today), 6) },
    { label: "Este mes", from: startOfMonth(today), to: endOfMonth(today) },
    { label: "Mes anterior", from: addMonths(startOfMonth(today), -1), to: endOfMonth(addMonths(startOfMonth(today), -1)) },
    ...(season?.season_start && season.season_end ? [{ label: "Temporada", from: season.season_start, to: season.season_end }] : []),
    { label: "Año", from: `${today.slice(0, 4)}-01-01`, to: `${today.slice(0, 4)}-12-31` },
  ];
  const from = isISODate(sp.desde) ? sp.desde : presets[1].from;
  const to = isISODate(sp.hasta) && sp.hasta >= from ? sp.hasta : presets[1].to;
  const categoryFilter = sp.categoria && /^[0-9a-f-]{36}$/i.test(sp.categoria) ? sp.categoria : null;

  const d = await asUser(t.viewer.id, async (db) => ({
    categories: await db.many<{ id: string; name: string; count: number; kind: string }>(
      `select c.id, c.name, c.kind, (select count(*) from expenses e where e.category_id = c.id)::int as count from expense_categories c where c.balneario_id = $1 order by c.kind = 'sueldos' desc, c.name`,
      [t.balnearioId],
    ),
    rows: await db.many<{ id: string; spent_on: string; amount_cents: number; description: string; payment_method: string; category: string; category_id: string; author: string | null; employee: string | null }>(
      `select e.id, e.spent_on, e.amount_cents, e.description, e.payment_method, c.name as category, c.id as category_id, p.full_name as author, em.full_name as employee
         from expenses e join expense_categories c on c.id = e.category_id left join profiles p on p.id = e.created_by left join employees em on em.id = e.employee_id
        where e.balneario_id = $1 and e.spent_on between $2 and $3 and ($4::uuid is null or e.category_id = $4)
        order by e.spent_on desc, e.created_at desc`,
      [t.balnearioId, from, to, categoryFilter],
    ),
    employees: await db.many<Employee>(
      `select em.id, em.full_name, em.phone, em.bank, em.account_holder, em.cbu, em.alias, em.active,
              coalesce((select sum(e.amount_cents) from expenses e where e.employee_id = em.id and e.spent_on between $2 and $3), 0)::bigint as paid_cents
         from employees em where em.balneario_id = $1 order by em.active desc, em.full_name`,
      [t.balnearioId, from, to],
    ),
  }));
  const sueldos = d.categories.find((c) => c.kind === "sueldos");
  const activeEmployees = d.employees.filter((e) => e.active);

  const total = d.rows.reduce((s, r) => s + r.amount_cents, 0);
  const byCategory = Object.values(
    d.rows.reduce<Record<string, { label: string; value: number }>>((acc, r) => {
      acc[r.category] = { label: r.category, value: (acc[r.category]?.value ?? 0) + r.amount_cents };
      return acc;
    }, {}),
  ).sort((a, b) => b.value - a.value);

  // Agrupación temporal: por semana en rangos cortos, por mes en rangos largos.
  const days = daysBetweenInclusive(from, to);
  const monthly = days > 62;
  const buckets: { label: string; key: string; value: number }[] = [];
  if (monthly) {
    for (let m = startOfMonth(from); m <= to && buckets.length < 24; m = addMonths(m, 1)) buckets.push({ key: m.slice(0, 7), label: monthLabel(m).replace(/ de \d{4}/, ""), value: 0 });
    for (const r of d.rows) { const b = buckets.find((x) => x.key === r.spent_on.slice(0, 7)); if (b) b.value += r.amount_cents; }
  } else {
    for (let w = startOfWeek(from); w <= to && buckets.length < 12; w = addDays(w, 7)) buckets.push({ key: w, label: formatDate(w, { day: "2-digit", month: "2-digit" }), value: 0 });
    for (const r of d.rows) { const b = buckets.find((x) => r.spent_on >= x.key && r.spent_on <= addDays(x.key, 6)); if (b) b.value += r.amount_cents; }
  }
  const qs = (extra: Record<string, string>) => `/owner/gastos?${new URLSearchParams({ desde: from, hasta: to, ...(categoryFilter ? { categoria: categoryFilter } : {}), ...extra })}`;

  return (
    <>
      <PageHeader eyebrow={t.balnearioName} title="Gastos" description="Registrá los gastos del balneario por categoría y consultalos por semana, mes o temporada. Solo los ve el dueño." actions={<ExportButtons base="/owner/gastos/exportar" query={(formato) => new URLSearchParams({ formato, desde: from, hasta: to, ...(categoryFilter ? { categoria: categoryFilter } : {}) }).toString()} />} />

      <div className="mb-4 flex flex-wrap items-end gap-2">
        {presets.map((p) => (
          <Link key={p.label} href={`/owner/gastos?desde=${p.from}&hasta=${p.to}`} className={cn("rounded-full border px-3 py-1.5 text-xs font-semibold", p.from === from && p.to === to ? "border-navy bg-navy text-white" : "border-line bg-white hover:border-sea")}>
            {p.label}
          </Link>
        ))}
        <form className="ml-auto flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs font-semibold text-mist">Desde<input type="date" name="desde" defaultValue={from} className="h-9 rounded-lg border border-line px-2 text-sm text-ink" /></label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-mist">Hasta<input type="date" name="hasta" defaultValue={to} className="h-9 rounded-lg border border-line px-2 text-sm text-ink" /></label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-mist">Categoría
            <select name="categoria" defaultValue={categoryFilter ?? ""} className="h-9 rounded-lg border border-line px-2 text-sm text-ink">
              <option value="">Todas</option>
              {d.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <button className="h-9 rounded-lg bg-foam px-4 text-sm font-semibold text-navy">Ver</button>
        </form>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Total del período" value={formatMoney(total)} icon={Coins} tone="held" hint={`Del ${formatDate(from)} al ${formatDate(to)}`} />
        <Stat label="Cantidad de gastos" value={d.rows.length} />
        <Stat label={monthly ? "Promedio mensual" : "Promedio semanal"} value={formatMoney(buckets.length ? Math.round(total / buckets.length) : 0)} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title={monthly ? "Gastos por mes" : "Gastos por semana"} />
              <CardBody><BarGroups data={buckets.map((b) => ({ label: b.label, values: [b.value] }))} series={[{ name: "Gastos", className: "bg-st-held" }]} format={formatMoney} /></CardBody>
            </Card>
            <Card>
              <CardHeader title="Por categoría" />
              <CardBody>{byCategory.length ? <HBar items={byCategory} format={formatMoney} /> : <p className="text-sm text-mist">Sin gastos en el período.</p>}</CardBody>
            </Card>
          </div>
          <Card>
            <CardHeader title="Detalle" />
            {d.rows.length ? (
              <Table>
                <thead><tr><Th>Fecha</Th><Th>Categoría</Th><Th>Descripción</Th><Th>Medio</Th><Th className="text-right">Importe</Th><Th /></tr></thead>
                <tbody>
                  {d.rows.map((r) => (
                    <tr key={r.id}>
                      <Td className="whitespace-nowrap">{formatDate(r.spent_on)}</Td>
                      <Td><Link href={qs({ categoria: r.category_id })} className="font-medium text-sea hover:underline">{r.category}</Link></Td>
                      <Td className="max-w-64 truncate">{r.employee ? <span className="font-semibold">{r.employee}</span> : null}{r.employee && r.description ? " · " : ""}{r.description || (r.employee ? "" : "—")}<p className="text-xs text-mist">{r.author ?? ""}</p></Td>
                      <Td>{METHOD_LABEL[r.payment_method] ?? r.payment_method}</Td>
                      <Td className="text-right font-semibold tabular-nums">{formatMoney(r.amount_cents)}</Td>
                      <Td><ActionButton action={deleteExpenseAction} payload={{ id: r.id }} label="Eliminar" variant="ghost" confirmText="¿Eliminar este gasto? Queda registrado en la auditoría." /></Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            ) : (
              <EmptyState icon={Coins} title="No hay gastos en este período" description="Cargá un gasto desde el formulario." />
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Nuevo gasto" />
            <CardBody>
              {d.categories.length ? (
                <QuickForm
                  action={createExpenseAction}
                  columns={1}
                  submitLabel="Registrar gasto"
                  fields={[
                    { name: "spentOn", label: "Fecha", type: "date", required: true, defaultValue: today },
                    { name: "categoryId", label: "Categoría", type: "select", required: true, options: d.categories.map((c) => ({ value: c.id, label: c.name })), defaultValue: d.categories.find((c) => c.kind !== "sueldos")?.id ?? d.categories[0].id },
                    ...(sueldos
                      ? [{ name: "employeeId", label: "Empleado", type: "select" as const, required: true, showIf: { field: "categoryId", equals: sueldos.id }, defaultValue: activeEmployees[0]?.id ?? "",
                           options: activeEmployees.map((e) => ({ value: e.id, label: e.full_name + (e.alias ? ` · alias ${e.alias}` : e.cbu ? ` · CBU ${e.cbu}` : "") })),
                           hint: activeEmployees.length ? "La cuenta del empleado se carga en “Empleados”." : "Primero agregá empleados en la tarjeta “Empleados”." }]
                      : []),
                    { name: "amount", label: "Importe ($)", type: "money", required: true, placeholder: "150.000" },
                    { name: "paymentMethod", label: "Medio de pago", type: "select", required: true, defaultValue: "efectivo", options: ["efectivo", "transferencia", "tarjeta", "otro"].map((m) => ({ value: m, label: METHOD_LABEL[m] })) },
                    { name: "description", label: "Descripción", type: "textarea" },
                  ]}
                />
              ) : (
                <p className="text-sm text-mist">Primero creá una categoría (por ejemplo: Sueldos, Materiales, Construcción).</p>
              )}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Empleados" description="Para registrar sueldos: teléfono y cuenta bancaria donde se deposita. Solo los ve el dueño." />
            <CardBody><EmployeesCard employees={d.employees} format={Object.fromEntries(d.employees.map((e) => [e.id, formatMoney(Number(e.paid_cents))]))} /></CardBody>
          </Card>
          <Card>
            <CardHeader title="Categorías" />
            <ul className="divide-y divide-line">
              {d.categories.map((c) => <CategoryRow key={c.id} id={c.id} name={c.name} count={c.count} locked={c.kind === "sueldos"} />)}
            </ul>
            <CardBody className="border-t border-line">
              <QuickForm action={createCategoryAction} columns={1} submitLabel="Agregar categoría" fields={[{ name: "name", label: "Nueva categoría", required: true, placeholder: "Ej.: Sueldos" }]} />
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
