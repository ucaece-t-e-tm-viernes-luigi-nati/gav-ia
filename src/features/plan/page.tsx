import { Check, Lock } from "lucide-react";
import { Alert, Badge, Card, CardBody, CardHeader, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { STATUS_LABELS, StatusBadge } from "@/components/panel/ui";
import { requireTenant } from "@/server/auth/context";
import { q, q1 } from "@/lib/db";
import { formatDate, formatDateTime } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { tenantCan } from "@/lib/permissions";
import { hasModule, MODULE_INFO, type Module } from "@/lib/plan";

/** Plan y pagos del balneario. Dueño: plan, abono, prueba, día de pago y pagos a GavIA. Staff: solo los módulos. */
export async function PlanPage({ searchParams }: { searchParams: Promise<{ modulo?: string }> }) {
  const t = await requireTenant();
  const { modulo } = await searchParams;
  const isOwner = tenantCan(t.role, "plan.view");
  // Sin RLS: el balneario sale de la sesión (requireTenant), nunca de la URL.
  const [b, payments] = isOwner
    ? await Promise.all([
        q1<{ plan: string | null; description: string | null; features: string[] | null; status: string; monthly_price_cents: string; currency: string; trial_ends_at: string | null; billing_day: number | null; next_due_date: string | null }>(
          `select p.name as plan, p.description, p.features, b.status, b.monthly_price_cents::text, b.currency, b.trial_ends_at, b.billing_day, b.next_due_date
             from balnearios b left join plans p on p.id = b.plan_id where b.id = $1`,
          [t.balnearioId],
        ),
        q<{ id: string; period: string; amount_cents: string; currency: string; status: string; method: string | null; due_date: string; paid_at: Date | null }>(
          `select id, period, amount_cents::text, currency, status, method, due_date, paid_at from client_payment where client_id = $1 order by period desc limit 24`,
          [t.balnearioId],
        ),
      ])
    : [null, []];
  const blocked = modulo && modulo in MODULE_INFO ? MODULE_INFO[modulo as Module] : null;

  return (
    <>
      <PageHeader eyebrow={t.balnearioName} title="Plan y pagos" description="Las funciones disponibles dependen del plan contratado con GavIA." />
      {blocked ? (
        <Alert tone="warning" title={`${blocked.label} no está incluido en el plan actual`} className="mb-4">
          Está disponible desde el plan {blocked.plan}. {isOwner ? "Escribinos para cambiar de plan." : "Consultalo con el dueño del balneario."}
        </Alert>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-2">
        {b ? (
          <Card>
            <CardHeader title={`Plan ${b.plan ?? "sin asignar"}`} description={b.description ?? undefined} action={<StatusBadge status={b.status} />} />
            <CardBody className="space-y-3 text-sm">
              <dl className="grid grid-cols-[170px_1fr] gap-y-1.5">
                <dt className="text-mist">Abono mensual</dt>
                <dd className="font-semibold">{Number(b.monthly_price_cents) > 0 ? formatMoney(Number(b.monthly_price_cents), b.currency) : "Sin costo"}</dd>
                <dt className="text-mist">Estado</dt>
                <dd>{STATUS_LABELS[b.status] ?? b.status}</dd>
                {b.trial_ends_at ? (
                  <>
                    <dt className="text-mist">Prueba gratis hasta</dt>
                    <dd>{formatDate(b.trial_ends_at)} (fecha límite del primer pago)</dd>
                  </>
                ) : null}
                <dt className="text-mist">Día de pago</dt>
                <dd>{b.billing_day ? `El ${b.billing_day} de cada mes` : "—"}</dd>
                <dt className="text-mist">Próximo vencimiento</dt>
                <dd>{formatDate(b.next_due_date)}</dd>
              </dl>
              {b.features?.length ? (
                <ul className="space-y-1.5 border-t border-line pt-3">
                  {b.features.map((f) => <li key={f} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-st-free" aria-hidden /> {f}</li>)}
                </ul>
              ) : null}
              <p className="text-xs text-mist">Medios de pago: transferencia bancaria o efectivo. Para cambiar de plan, respondé cualquier mail de GavIA.</p>
            </CardBody>
          </Card>
        ) : null}
        <Card>
          <CardHeader title="Módulos" description="Incluidos en todos los planes: plano, reservas, clientes, calendario, gastos y usuarios." />
          <ul className="divide-y divide-line text-sm">
            {(Object.keys(MODULE_INFO) as Module[]).map((m) => {
              const on = hasModule(t.modules, m);
              const info = MODULE_INFO[m];
              return (
                <li key={m} className="flex items-center justify-between gap-3 px-5 py-3">
                  <span className="flex items-center gap-2">
                    {on ? <Check className="size-4 text-st-free" aria-hidden /> : <Lock className="size-4 text-mist" aria-hidden />}
                    {info.label}
                  </span>
                  <span className="flex gap-1">
                    {on ? <Badge tone="success">Incluido</Badge> : <Badge tone="muted">Plan {info.plan}</Badge>}
                    {on && !info.built ? <Badge tone="warning">En desarrollo</Badge> : null}
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
      {isOwner ? (
        <Card className="mt-4">
          <CardHeader title="Pagos del abono" description="Los registra el equipo de GavIA al recibir tu pago." />
          {payments.length ? (
            <Table>
              <thead><tr><Th>Período</Th><Th>Monto</Th><Th>Estado</Th><Th>Medio</Th><Th>Vencía</Th><Th>Pagado</Th></tr></thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id}>
                    <Td>{p.period}</Td>
                    <Td>{formatMoney(Number(p.amount_cents), p.currency)}</Td>
                    <Td><StatusBadge status={p.status} /></Td>
                    <Td>{p.method ?? "—"}</Td>
                    <Td>{formatDate(p.due_date)}</Td>
                    <Td>{formatDateTime(p.paid_at)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <CardBody className="text-sm text-mist">Todavía no hay pagos registrados.</CardBody>
          )}
        </Card>
      ) : null}
    </>
  );
}
