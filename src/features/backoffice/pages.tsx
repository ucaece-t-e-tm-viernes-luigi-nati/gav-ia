import Link from "next/link";
import { Badge, Card, CardBody, CardHeader, DemoTag, PageHeader } from "@/components/ui/primitives";
import { BarGroups, HBar } from "@/components/ui/charts";
import { ActionButton, ActionSelect, QuickForm } from "@/components/ui/quick-form";
import { STATUS_LABELS } from "@/components/panel/ui";
import { requireSuperadmin } from "@/server/auth/context";
import { asUser } from "@/server/db";
import { q } from "@/lib/db";
import { addLeadInteractionAction, createLeadAction, updateLeadStageAction } from "@/server/actions/crm";
import { updateDemoAction } from "@/server/actions/demos";
import { formatMoney } from "@/lib/money";
import { addMonths, formatDateTime, monthLabel, startOfMonth, todayISO } from "@/lib/dates";

// Lo útil del backoffice de la v2.1, dentro de /plataforma: CRM comercial con demos agendadas y reportes globales.
// La supervisión de cada balneario está en ./supervision.tsx.

const STAGES = [
  { value: "prospecto", label: "Prospecto" }, { value: "contactado", label: "Contactado" }, { value: "demo", label: "Demo" },
  { value: "propuesta", label: "Propuesta" }, { value: "ganado", label: "Ganado" }, { value: "perdido", label: "Perdido" },
];

export async function CrmPage({ searchParams }: { searchParams: Promise<{ lead?: string }> }) {
  const v = await requireSuperadmin("crm");
  const sp = await searchParams;
  const { leads, interactions, demos } = await asUser(v.id, async (db) => ({
    leads: await db.many<{ id: string; business_name: string; contact_name: string; phone: string; email: string; city: string; stage: string; source: string; is_demo: boolean; updated_at: string }>(
      `select id, business_name, contact_name, phone, email, city, stage, source, is_demo, updated_at from leads order by updated_at desc`),
    interactions: await db.many<{ id: string; lead_id: string; kind: string; summary: string; occurred_at: string }>(
      `select id, lead_id, kind, summary, occurred_at from interactions where scope = 'gavia' order by occurred_at desc limit 200`),
    demos: await db.many<{ id: string; starts_at: string; name: string; business_name: string; phone: string; email: string; city: string; status: string }>(
      `select id, starts_at, name, business_name, phone, email, city, status from demo_bookings where status = 'agendada' order by starts_at limit 20`),
  }));
  const selected = leads.find((l) => l.id === sp.lead);
  return (
    <>
      <PageHeader eyebrow="Plataforma GavIA" title="CRM y demos agendadas" description="Prospectos comerciales por etapa del embudo y demos pedidas desde la landing (“Agendar demo”)." />
      <Card className="mb-4">
        <CardHeader title="Demos agendadas" description="Turnos de 30 minutos reservados desde la landing. Cada demo crea el prospecto en el CRM y el evento en el calendario." />
        <ul className="divide-y divide-line text-sm">
          {demos.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-2.5">
              <span>
                <span className="font-semibold">{formatDateTime(m.starts_at)}</span> · {m.business_name || "—"} — {m.name}
                <span className="block text-xs text-mist">{m.phone} · {m.email}{m.city ? ` · ${m.city}` : ""}</span>
              </span>
              <span className="flex gap-1">
                <ActionButton action={updateDemoAction} payload={{ id: m.id, status: "realizada" }} label="Realizada" variant="secondary" />
                <ActionButton action={updateDemoAction} payload={{ id: m.id, status: "cancelada" }} label="Cancelar" variant="ghost" confirmText="¿Cancelar esta demo? El turno queda libre." />
              </span>
            </li>
          ))}
          {!demos.length ? <li className="px-5 py-6 text-center text-mist">No hay demos agendadas.</li> : null}
        </ul>
      </Card>
      <div className="overflow-x-auto pb-2">
        <div className="grid min-w-[1100px] grid-cols-6 gap-3">
          {STAGES.map((s) => {
            const list = leads.filter((l) => l.stage === s.value);
            return (
              <div key={s.value} className="rounded-xl bg-sand/50 p-2">
                <p className="mb-2 flex justify-between px-1 text-xs font-bold uppercase tracking-wide text-mist">{s.label}<span>{list.length}</span></p>
                <div className="space-y-2">
                  {list.map((l) => (
                    <Card key={l.id} className="p-3 text-sm">
                      <Link href={`/plataforma/crm?lead=${l.id}`} className="font-semibold text-navy hover:underline">{l.business_name}</Link>
                      <p className="text-xs text-mist">{l.contact_name} · {l.city}</p>
                      {l.is_demo ? <DemoTag /> : null}
                      <div className="mt-2"><ActionSelect action={updateLeadStageAction} payload={{ id: l.id }} field="stage" value={l.stage} options={STAGES} label={`Etapa de ${l.business_name}`} /></div>
                    </Card>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {selected ? (
          <Card>
            <CardHeader title={selected.business_name} description={`${selected.contact_name} · ${selected.phone} · ${selected.email} · origen: ${selected.source || "—"}`} />
            <CardBody className="space-y-3">
              <QuickForm action={addLeadInteractionAction} hidden={{ leadId: selected.id }} submitLabel="Registrar interacción" columns={1} fields={[
                { name: "kind", label: "Tipo", type: "select", required: true, defaultValue: "llamada", options: [{ value: "llamada", label: "Llamada" }, { value: "whatsapp", label: "WhatsApp" }, { value: "email", label: "Correo" }, { value: "reunion", label: "Reunión" }, { value: "nota", label: "Nota" }] },
                { name: "summary", label: "Resumen", type: "textarea", required: true },
              ]} />
              <ul className="divide-y divide-line text-sm">
                {interactions.filter((i) => i.lead_id === selected.id).map((i) => <li key={i.id} className="py-2"><Badge>{i.kind}</Badge> {i.summary}<p className="text-xs text-mist">{formatDateTime(i.occurred_at)}</p></li>)}
              </ul>
            </CardBody>
          </Card>
        ) : (
          <Card><CardBody className="text-sm text-mist">Seleccioná un prospecto para ver su historial de interacciones.</CardBody></Card>
        )}
        <Card>
          <CardHeader title="Nuevo prospecto" />
          <CardBody>
            <QuickForm action={createLeadAction} submitLabel="Crear prospecto" fields={[
              { name: "businessName", label: "Establecimiento", required: true }, { name: "contactName", label: "Contacto" },
              { name: "phone", label: "Teléfono" }, { name: "email", label: "Correo", type: "email" },
              { name: "city", label: "Localidad" }, { name: "source", label: "Origen" }, { name: "notes", label: "Notas", type: "textarea", wide: true },
            ]} />
          </CardBody>
        </Card>
      </div>
    </>
  );
}

export async function GaviaReportesPage() {
  const v = await requireSuperadmin("reportes");
  const today = todayISO();
  const months = Array.from({ length: 6 }, (_, i) => startOfMonth(addMonths(today, i - 5)));
  // Ingresos de GavIA = abonos de los balnearios (client_payment). Nunca lo que factura cada balneario.
  const [income, statuses, plans] = await Promise.all([
    q<{ period: string; currency: string; s: string }>(
      `select to_char(paid_at at time zone 'America/Argentina/Buenos_Aires', 'YYYY-MM') as period, currency, sum(amount_cents)::text as s
         from client_payment where status = 'paid' and paid_at >= $1::date group by 1, 2`, [months[0]]),
    q<{ status: string; n: number }>(`select status, count(*)::int as n from balnearios group by status`),
    q<{ name: string; n: number }>(`select p.name, count(*)::int as n from balnearios b join plans p on p.id = b.plan_id where b.status in ('trial','active','past_due') group by p.name, p.sort_order order by p.sort_order`),
  ]);
  const stages = await asUser(v.id, (db) => db.many<{ stage: string; n: number }>(`select stage, count(*)::int as n from leads group by stage`));
  const usd = (cents: number) => formatMoney(cents, "USD");
  const incomeData = months.map((m) => ({
    label: monthLabel(m).replace(/ de \d{4}/, ""),
    values: [income.filter((r) => r.period === m.slice(0, 7) && r.currency === "USD").reduce((s, r) => s + Number(r.s), 0)],
  }));
  return (
    <>
      <PageHeader eyebrow="Plataforma GavIA" title="Reportes globales" description="Indicadores de GavIA como empresa (abonos cobrados, embudo y cartera). No incluye lo que factura cada balneario, que es confidencial." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card><CardHeader title="Abonos cobrados por mes (USD)" /><CardBody><BarGroups data={incomeData} series={[{ name: "Abonos pagados", className: "bg-navy" }]} format={usd} /></CardBody></Card>
        <Card><CardHeader title="Embudo comercial" /><CardBody><HBar items={STAGES.map((s) => ({ label: s.label, value: stages.find((x) => x.stage === s.value)?.n ?? 0 }))} format={(n) => String(n)} /></CardBody></Card>
        <Card><CardHeader title="Balnearios por estado" /><CardBody><HBar items={statuses.map((s) => ({ label: STATUS_LABELS[s.status] ?? s.status, value: s.n }))} format={(n) => String(n)} /></CardBody></Card>
        <Card><CardHeader title="Balnearios vigentes por plan" /><CardBody><HBar items={plans.map((p) => ({ label: p.name, value: p.n }))} format={(n) => String(n)} /></CardBody></Card>
      </div>
    </>
  );
}
