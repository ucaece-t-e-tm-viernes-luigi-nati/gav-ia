import Link from "next/link";
import { notFound } from "next/navigation";
import { Building2, CalendarClock, Eye, Handshake, Layers, ShieldPlus, TrendingUp, Users, Wallet, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardBody, CardHeader, DemoTag, PageHeader, Stat, Table, Td, Th, type Tone } from "@/components/ui/primitives";
import { BarGroups, HBar } from "@/components/ui/charts";
import { ActionButton, ActionSelect, QuickForm, TempPasswordButton } from "@/components/ui/quick-form";
import { requireSuperadmin } from "@/server/auth/context";
import { asUser } from "@/server/db";
import {
  addLeadInteractionAction, addMemberAction, createBalnearioAction, createInvoiceAction, createLeadAction, registerGaviaPaymentAction, resetPasswordAction,
  setBalnearioStatusAction, setMemberAction, updateBalnearioInfoAction, updateLeadStageAction, updatePlanAction, updateSubscriptionAction,
} from "@/server/actions/backoffice";
import { listPendingReminders } from "@/server/repos/agenda";
import { centsToInput, formatMoney } from "@/lib/money";
import { addMonths, formatDate, formatDateTime, monthLabel, startOfMonth, todayISO } from "@/lib/dates";
import { AuditList } from "@/features/owner/pages";
import { MODULE_INFO, type Module } from "@/lib/plan";
import { NewSuperadminForm, SuperadminPermissions } from "./superadmins";
import { UserCredentials } from "./user-credentials";
import { updateDemoAction } from "@/server/actions/demos";

// Los importes de GAVIA (planes, suscripciones y facturas) se expresan en dólares.
const usd = (cents: number) => formatMoney(cents, "USD");
const B_STATUS: Record<string, Tone> = { prueba: "warning", activo: "success", suspendido: "danger" };
const STAGE_LABEL: Record<string, string> = { prueba: "TESTING", activo: "ACTIVO", suspendido: "SUSPENDIDO" };
const STAGES_OPTIONS = ["prueba", "activo", "suspendido"].map((s) => ({ value: s, label: STAGE_LABEL[s] }));
const STAGES = [
  { value: "prospecto", label: "Prospecto" }, { value: "contactado", label: "Contactado" }, { value: "demo", label: "Demo" },
  { value: "propuesta", label: "Propuesta" }, { value: "ganado", label: "Ganado" }, { value: "perdido", label: "Perdido" },
];
const SUB_STATUS = [{ value: "prueba", label: "Prueba" }, { value: "activa", label: "Activa" }, { value: "vencida", label: "Vencida" }, { value: "cancelada", label: "Cancelada" }];

export async function BackofficeDashboard() {
  const v = await requireSuperadmin("dashboard");
  const d = await asUser(v.id, async (db) => {
    const k = await db.one<{ activos: number; prueba: number; clientes: number; prospectos: number; ganados: number; cerrados: number; subs: number; ingresos_mes: number; ingresos_anio: number; pendiente: number; renovaciones: number }>(
      `select
        (select count(*) from balnearios where status = 'activo')::int as activos,
        (select count(*) from balnearios where status = 'prueba')::int as prueba,
        (select count(distinct balneario_id) from subscriptions where status = 'activa')::int as clientes,
        (select count(*) from leads where stage not in ('ganado', 'perdido'))::int as prospectos,
        (select count(*) from leads where stage = 'ganado')::int as ganados,
        (select count(*) from leads where stage in ('ganado', 'perdido'))::int as cerrados,
        (select count(*) from subscriptions where status in ('activa', 'prueba'))::int as subs,
        (select coalesce(sum(amount_cents), 0) from gavia_payments where local_date(paid_at) >= date_trunc('month', current_date)) as ingresos_mes,
        (select coalesce(sum(amount_cents), 0) from gavia_payments where local_date(paid_at) >= date_trunc('year', current_date)) as ingresos_anio,
        (select coalesce(sum(amount_cents), 0) from gavia_invoices where status in ('emitida', 'vencida')) as pendiente,
        (select count(*) from subscriptions where status in ('activa', 'prueba') and current_period_end <= current_date + 60)::int as renovaciones`,
    );
    const activity = await db.many<{ id: number; action: string; created_at: string; actor: string | null; balneario: string | null }>(
      `select a.id, a.action, a.created_at, p.full_name as actor, b.name as balneario from audit_log a left join profiles p on p.id = a.actor_id
         left join balnearios b on b.id = a.balneario_id order by a.created_at desc limit 10`,
    );
    const renewals = await db.many<{ name: string; end: string; status: string; id: string }>(
      `select b.name, b.id, s.current_period_end as end, s.status from subscriptions s join balnearios b on b.id = s.balneario_id
        where s.status in ('activa', 'prueba') and s.current_period_end <= current_date + 60 order by s.current_period_end limit 6`,
    );
    const rem = await listPendingReminders(db, { scope: "gavia" }, 6);
    const demos = await db.many<{ id: string; starts_at: string; name: string; business_name: string; phone: string; email: string; status: string }>(
      `select id, starts_at, name, business_name, phone, email, status from demo_bookings where status = 'agendada' order by starts_at limit 10`,
    );
    return { k: k!, activity, renewals, rem, demos };
  });
  const conv = d.k.cerrados ? Math.round((d.k.ganados / d.k.cerrados) * 100) : 0;
  return (
    <>
      <PageHeader eyebrow="Backoffice GAVIA" title="Panel global" description="Métricas comerciales de GAVIA. Los ingresos mostrados son de GAVIA (suscripciones), no de los balnearios." />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Balnearios activos" value={d.k.activos} icon={Building2} hint={`${d.k.prueba} en período de prueba`} />
        <Stat label="Clientes comerciales" value={d.k.clientes} icon={Users} hint="Con suscripción activa" />
        <Stat label="Prospectos abiertos" value={d.k.prospectos} icon={Handshake} />
        <Stat label="Conversión comercial" value={`${conv}%`} icon={TrendingUp} hint={`${d.k.ganados} ganados sobre ${d.k.cerrados} cerrados`} />
        <Stat label="Suscripciones vigentes" value={d.k.subs} icon={Layers} />
        <Stat label="Ingresos GAVIA del mes" value={usd(d.k.ingresos_mes)} icon={Wallet} tone="free" hint={`Año: ${usd(d.k.ingresos_anio)}`} />
        <Stat label="Pendiente de cobro (suscripciones)" value={usd(d.k.pendiente)} icon={AlertCircle} tone="busy" />
        <Stat label="Renovaciones (60 días)" value={d.k.renovaciones} icon={CalendarClock} tone="held" />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Próximas renovaciones" />
          <ul className="divide-y divide-line text-sm">
            {d.renewals.map((r) => <li key={r.id} className="flex justify-between px-5 py-2.5"><Link href={`/backoffice/balnearios/${r.id}`} className="hover:underline">{r.name}</Link><span className="text-mist">{formatDate(r.end)}</span></li>)}
            {!d.renewals.length ? <li className="px-5 py-6 text-center text-mist">Sin renovaciones próximas.</li> : null}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Seguimientos comerciales" action={<Link className="text-xs font-semibold text-sea" href="/backoffice/calendario">Calendario</Link>} />
          <ul className="divide-y divide-line text-sm">
            {d.rem.map((r) => <li key={r.id} className="px-5 py-2.5"><p className="font-medium">{r.title}</p><p className="text-xs text-mist">{formatDateTime(r.due_at)} {r.overdue ? <Badge tone="danger">Vencido</Badge> : null}</p></li>)}
            {!d.rem.length ? <li className="px-5 py-6 text-center text-mist">Sin seguimientos.</li> : null}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Actividad reciente" action={<Link className="text-xs font-semibold text-sea" href="/backoffice/auditoria">Auditoría</Link>} />
          <ul className="divide-y divide-line text-xs">
            {d.activity.map((a) => <li key={a.id} className="px-5 py-2"><span className="font-semibold">{a.action}</span> · {a.balneario ?? "GAVIA"}<br /><span className="text-mist">{formatDateTime(a.created_at)} · {a.actor ?? "Sistema"}</span></li>)}
          </ul>
        </Card>
      </div>
      <Card className="mt-4">
        <CardHeader title="Próximas demos agendadas" description="Reservadas desde la landing (también figuran en el calendario)." action={<Link className="text-xs font-semibold text-sea" href="/agendar-demo" target="_blank">Ver agenda pública</Link>} />
        <ul className="divide-y divide-line text-sm">
          {d.demos.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-2.5">
              <span><span className="font-semibold">{formatDateTime(m.starts_at)}</span> · {m.business_name} — {m.name}<span className="block text-xs text-mist">{m.phone} · {m.email}</span></span>
              <span className="flex gap-1">
                <ActionButton action={updateDemoAction} payload={{ id: m.id, status: "realizada" }} label="Realizada" variant="secondary" />
                <ActionButton action={updateDemoAction} payload={{ id: m.id, status: "cancelada" }} label="Cancelar" variant="ghost" confirmText="¿Cancelar esta demo? El turno queda libre." />
              </span>
            </li>
          ))}
          {!d.demos.length ? <li className="px-5 py-6 text-center text-mist">No hay demos agendadas.</li> : null}
        </ul>
      </Card>
    </>
  );
}

export async function BalneariosPage() {
  const v = await requireSuperadmin("balnearios");
  const { rows, plans } = await asUser(v.id, async (db) => ({
    rows: await db.many<{ id: string; name: string; city: string; phone: string; status: string; is_demo: boolean; units: number; owners: string | null; plan: string | null; sub_status: string | null; trial_end: string | null; expired: boolean }>(
      `select b.id, b.name, b.city, b.phone, b.status, b.is_demo,
              b.status = 'activo' and coalesce((select s.current_period_end from subscriptions s where s.balneario_id = b.id order by s.created_at desc limit 1) < current_date, false) as expired,
              (select count(*) from units u where u.balneario_id = b.id)::int as units,
              (select string_agg(p.full_name, ', ') from memberships m join profiles p on p.id = m.user_id where m.balneario_id = b.id and m.role = 'owner') as owners,
              (select pl.name from subscriptions s join plans pl on pl.id = s.plan_id where s.balneario_id = b.id order by s.created_at desc limit 1) as plan,
              (select s.status from subscriptions s where s.balneario_id = b.id order by s.created_at desc limit 1) as sub_status,
              (select s.current_period_end from subscriptions s where s.balneario_id = b.id order by s.created_at desc limit 1) as trial_end
         from balnearios b order by b.name`,
    ),
    plans: await db.many<{ id: string; name: string; description: string }>(`select id, name, description from plans where active order by sort_order`),
  }));
  return (
    <>
      <PageHeader eyebrow="Backoffice GAVIA" title="Balnearios" description="Establecimientos registrados en la plataforma." />
      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <Card>
          <Table>
            <thead><tr><Th>Balneario</Th><Th>Dueño</Th><Th>Plan</Th><Th className="text-right">Unidades</Th><Th>Estado</Th></tr></thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.id}>
                  <Td><Link className="font-semibold text-navy hover:underline" href={`/backoffice/balnearios/${b.id}`}>{b.name}</Link> {b.is_demo ? <DemoTag /> : null}<p className="text-xs text-mist">{[b.city, b.phone].filter(Boolean).join(" · ")}</p></Td>
                  <Td className="text-mist">{b.owners ?? "—"}</Td>
                  <Td>{b.plan ?? "—"} {b.sub_status ? <span className="text-xs text-mist">({b.sub_status})</span> : null}</Td>
                  <Td className="text-right tabular-nums">{b.units}</Td>
                  <Td>
                    <ActionSelect action={setBalnearioStatusAction} payload={{ id: b.id }} field="status" value={b.status} label={`Estado de ${b.name}`} options={STAGES_OPTIONS} confirmText={{ suspendido: `¿Suspender ${b.name}? Sus usuarios no van a poder ingresar.` }} />
                    {b.expired ? <p className="mt-1"><Badge tone="danger">SIN RENOVAR</Badge></p> : null}
                    {b.status === "prueba" && b.trial_end ? <p className="mt-1 text-xs text-mist">Prueba hasta {formatDate(b.trial_end)}</p> : null}
                    {b.status === "activo" && b.trial_end ? <p className="mt-1 text-xs text-mist">Plan hasta {formatDate(b.trial_end)}</p> : null}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
        <Card className="h-fit">
          <CardHeader title="Registrar balneario" description="Se crea en TESTING (15 días de prueba), con su dueño, el plan elegido y un plano predeterminado de playa y cocheras." />
          <CardBody>
            <QuickForm
              action={createBalnearioAction}
              columns={1}
              submitLabel="Crear balneario"
              fields={[
                { name: "name", label: "Nombre del balneario", required: true },
                { name: "phone", label: "Teléfono del balneario", type: "tel", required: true },
                { name: "address", label: "Dirección del balneario", required: true },
                { name: "city", label: "Localidad" },
                { name: "ownerName", label: "Nombre del dueño", required: true },
                { name: "ownerPhone", label: "Teléfono del dueño", type: "tel", required: true },
                { name: "ownerEmail", label: "Correo del dueño", type: "email", required: true, hint: "Con este correo ingresa al sistema. Se genera una contraseña temporal." },
                { name: "planId", label: "Plan", type: "select", required: true, options: plans.map((p) => ({ value: p.id, label: `${p.name} — ${p.description}` })), defaultValue: plans[0]?.id, hint: "Define qué módulos ve el balneario (dueño y administradores)." },
              ]}
            />
          </CardBody>
        </Card>
      </div>
    </>
  );
}

export async function BalnearioDetailPage({ id }: { id: string }) {
  const v = await requireSuperadmin("balnearios");
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const d = await asUser(v.id, async (db) => {
    const b = await db.one<{ id: string; name: string; slug: string; city: string; address: string; phone: string; email: string; status: string; season_start: string | null; season_end: string | null; created_at: string; is_demo: boolean }>(
      `select id, name, slug, city, address, phone, email, status, season_start, season_end, created_at, is_demo from balnearios where id = $1`, [id]);
    if (!b) return null;
    const [members, units, subs, invoices, ops] = await Promise.all([
      db.many<{ id: string; role: string; active: boolean; full_name: string; email: string; phone: string }>(`select m.id, m.role, m.active, p.full_name, p.email, p.phone from memberships m join profiles p on p.id = m.user_id where m.balneario_id = $1 order by m.role desc`, [id]),
      db.many<{ map: string; kind: string; n: number }>(`select map, kind, count(*)::int as n from units where balneario_id = $1 group by map, kind order by map, kind`, [id]),
      db.many<{ id: string; plan: string; status: string; price_cents: number; current_period_start: string; current_period_end: string }>(
        `select s.id, p.name as plan, s.status, s.price_cents, s.current_period_start, s.current_period_end from subscriptions s join plans p on p.id = s.plan_id where s.balneario_id = $1 order by s.created_at desc`, [id]),
      db.many<{ id: string; number: number; concept: string; amount_cents: number; status: string; due_date: string }>(`select id, number, concept, amount_cents, status, due_date from gavia_invoices where balneario_id = $1 order by issued_at desc`, [id]),
      db.one<{ reservations: number; customers: number }>(`select (select count(*) from reservations where balneario_id = $1)::int as reservations, (select count(*) from customers where balneario_id = $1)::int as customers`, [id]),
    ]);
    return { b, members, units, subs, invoices, ops };
  });
  if (!d) notFound();
  return (
    <>
      <PageHeader
        eyebrow="Ficha del balneario"
        title={d.b.name}
        description={`${d.b.city} · alta ${formatDate(d.b.created_at)} · identificador ${d.b.slug}`}
        actions={<>{d.b.is_demo ? <DemoTag /> : null}<ActionSelect action={setBalnearioStatusAction} payload={{ id: d.b.id }} field="status" value={d.b.status} label="Estado del balneario" options={STAGES_OPTIONS} /><Button size="sm" variant="secondary" asChild><Link href={`/backoffice/balnearios/${d.b.id}/supervision`}><Eye /> Supervisar (sin importes)</Link></Button></>}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Datos y operación" description="GAVIA ve volúmenes operativos, no los datos de los clientes del balneario." />
          <CardBody className="grid grid-cols-2 gap-3 text-sm">
            <p><span className="text-mist">Teléfono:</span> {d.b.phone || "—"}</p>
            <p><span className="text-mist">Correo:</span> {d.b.email || "—"}</p>
            <p><span className="text-mist">Dirección:</span> {d.b.address || "—"}</p>
            <p><span className="text-mist">Temporada:</span> {formatDate(d.b.season_start)} – {formatDate(d.b.season_end)}</p>
            <p><span className="text-mist">Reservas:</span> {d.ops?.reservations}</p>
            <p><span className="text-mist">Clientes:</span> {d.ops?.customers}</p>
            <div className="col-span-2 flex flex-wrap gap-1">{d.units.map((u) => <Badge key={u.kind} tone="info">{u.n} {u.kind}s · {u.map}</Badge>)}{!d.units.length ? <span className="text-mist">Plano sin unidades todavía.</span> : null}</div>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Usuarios" />
          <ul className="divide-y divide-line text-sm">
            {d.members.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5">
                <span>{m.full_name} <span className="block text-xs text-mist">{m.email}{m.phone ? ` · ${m.phone}` : ""}</span></span>
                <span className="flex items-center gap-2">
                  <ActionSelect action={setMemberAction} payload={{ membershipId: m.id }} field="role" value={m.role} label={`Rol de ${m.full_name}`} options={[{ value: "owner", label: "Dueño" }, { value: "admin", label: "Administrador" }]} confirmText={{ owner: `¿Dar acceso de dueño a ${m.full_name}? Va a ver toda la información del balneario, incluida la financiera.` }} />
                  <ActionButton action={setMemberAction} payload={{ membershipId: m.id, active: !m.active }} label={m.active ? "Desactivar" : "Reactivar"} variant="ghost" confirmText={m.active ? `¿Quitarle el acceso a ${m.full_name}?` : undefined} />
                </span>
              </li>
            ))}
          </ul>
          <CardBody className="border-t border-line">
            <QuickForm action={addMemberAction} hidden={{ balnearioId: d.b.id }} submitLabel="Asociar usuario" fields={[
              { name: "fullName", label: "Nombre", required: true }, { name: "email", label: "Correo", type: "email", required: true },
              { name: "phone", label: "Teléfono", type: "tel", required: true },
              { name: "role", label: "Rol", type: "select", required: true, defaultValue: "admin", options: [{ value: "owner", label: "Dueño" }, { value: "admin", label: "Administrador" }] },
            ]} columns={2} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Editar datos del balneario" description="El estado (TESTING / ACTIVO / SUSPENDIDO) se cambia arriba a la derecha o desde el listado." />
          <CardBody>
            <QuickForm action={updateBalnearioInfoAction} hidden={{ id: d.b.id }} resetOnSuccess={false} submitLabel="Guardar datos" fields={[
              { name: "name", label: "Nombre", defaultValue: d.b.name, required: true },
              { name: "phone", label: "Teléfono", type: "tel", defaultValue: d.b.phone },
              { name: "address", label: "Dirección", defaultValue: d.b.address },
              { name: "city", label: "Localidad", defaultValue: d.b.city },
              { name: "email", label: "Correo de contacto", type: "email", defaultValue: d.b.email },
            ]} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Suscripción" />
          <Table><tbody>{d.subs.map((s) => <tr key={s.id}><Td>{s.plan}</Td><Td>{formatDate(s.current_period_start)} – {formatDate(s.current_period_end)}</Td><Td className="tabular-nums">{usd(s.price_cents)}</Td><Td><Badge>{s.status}</Badge></Td></tr>)}</tbody></Table>
        </Card>
        <Card>
          <CardHeader title="Facturas de GAVIA" />
          <Table><tbody>{d.invoices.map((i) => <tr key={i.id}><Td>N.º {i.number}</Td><Td>{i.concept}</Td><Td className="tabular-nums">{usd(i.amount_cents)}</Td><Td><Badge tone={i.status === "pagada" ? "success" : i.status === "anulada" ? "muted" : "warning"}>{i.status}</Badge></Td></tr>)}</tbody></Table>
        </Card>
      </div>
    </>
  );
}

export async function CrmPage({ searchParams }: { searchParams: Promise<{ lead?: string }> }) {
  const v = await requireSuperadmin("crm");
  const sp = await searchParams;
  const { leads, interactions } = await asUser(v.id, async (db) => ({
    leads: await db.many<{ id: string; business_name: string; contact_name: string; phone: string; email: string; city: string; stage: string; source: string; is_demo: boolean; updated_at: string }>(
      `select id, business_name, contact_name, phone, email, city, stage, source, is_demo, updated_at from leads order by updated_at desc`),
    interactions: await db.many<{ id: string; lead_id: string; kind: string; summary: string; occurred_at: string }>(`select id, lead_id, kind, summary, occurred_at from interactions where scope = 'gavia' order by occurred_at desc limit 200`),
  }));
  const selected = leads.find((l) => l.id === sp.lead);
  return (
    <>
      <PageHeader eyebrow="Backoffice GAVIA" title="CRM comercial" description="Prospectos y clientes comerciales de GAVIA, por etapa del embudo." />
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
                      <Link href={`/backoffice/crm?lead=${l.id}`} className="font-semibold text-navy hover:underline">{l.business_name}</Link>
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

export async function SuscripcionesPage() {
  const v = await requireSuperadmin("suscripciones");
  const { subs, plans } = await asUser(v.id, async (db) => ({
    subs: await db.many<{ id: string; balneario: string; balneario_id: string; plan_id: string; status: string; price_cents: number; current_period_end: string }>(
      `select s.id, b.name as balneario, b.id as balneario_id, s.plan_id, s.status, s.price_cents, s.current_period_end from subscriptions s join balnearios b on b.id = s.balneario_id order by s.current_period_end`),
    plans: await db.many<{ id: string; name: string }>(`select id, name from plans order by sort_order`),
  }));
  return (
    <>
      <PageHeader eyebrow="Backoffice GAVIA" title="Suscripciones" description="Planes contratados por cada balneario." />
      <Card>
        <Table>
          <thead><tr><Th>Balneario</Th><Th>Plan</Th><Th>Estado</Th><Th className="text-right">Precio</Th><Th>Vence</Th></tr></thead>
          <tbody>
            {subs.map((s) => (
              <tr key={s.id}>
                <Td><Link className="font-semibold hover:underline" href={`/backoffice/balnearios/${s.balneario_id}`}>{s.balneario}</Link></Td>
                <Td><ActionSelect action={updateSubscriptionAction} payload={{ id: s.id, status: s.status, periodEnd: s.current_period_end }} field="planId" value={s.plan_id} options={plans.map((p) => ({ value: p.id, label: p.name }))} label="Plan" /></Td>
                <Td><ActionSelect action={updateSubscriptionAction} payload={{ id: s.id, planId: s.plan_id, periodEnd: s.current_period_end }} field="status" value={s.status} options={SUB_STATUS} label="Estado" /></Td>
                <Td className="text-right tabular-nums">{usd(s.price_cents)}</Td>
                <Td>{formatDate(s.current_period_end)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}

export async function FacturacionPage() {
  const v = await requireSuperadmin("facturacion");
  const { invoices, payments, balnearios } = await asUser(v.id, async (db) => ({
    invoices: await db.many<{ id: string; number: number; balneario: string; concept: string; amount_cents: number; issued_at: string; due_date: string; status: string }>(
      `select i.id, i.number, b.name as balneario, i.concept, i.amount_cents, i.issued_at, i.due_date,
              case when i.status = 'emitida' and i.due_date < current_date then 'vencida' else i.status end as status
         from gavia_invoices i join balnearios b on b.id = i.balneario_id order by i.issued_at desc`),
    payments: await db.many<{ id: string; balneario: string; amount_cents: number; method: string; reference: string; paid_at: string; number: number }>(
      `select p.id, b.name as balneario, p.amount_cents, p.method, p.reference, p.paid_at, i.number from gavia_payments p join balnearios b on b.id = p.balneario_id join gavia_invoices i on i.id = p.invoice_id order by p.paid_at desc limit 100`),
    balnearios: await db.many<{ id: string; name: string }>(`select id, name from balnearios where status <> 'baja' order by name`),
  }));
  return (
    <>
      <PageHeader eyebrow="Backoffice GAVIA" title="Facturación de GAVIA" description="Facturas y pagos de suscripciones que los balnearios abonan a GAVIA. Separado por completo de los cobros de cada balneario." />
      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <Card>
            <CardHeader title="Facturas" />
            <Table>
              <thead><tr><Th>N.º</Th><Th>Balneario</Th><Th>Concepto</Th><Th>Vence</Th><Th className="text-right">Importe</Th><Th>Estado</Th><Th /></tr></thead>
              <tbody>
                {invoices.map((i) => (
                  <tr key={i.id}>
                    <Td>{i.number}</Td><Td>{i.balneario}</Td><Td className="max-w-56 truncate">{i.concept}</Td><Td>{formatDate(i.due_date)}</Td>
                    <Td className="text-right tabular-nums">{usd(i.amount_cents)}</Td>
                    <Td><Badge tone={i.status === "pagada" ? "success" : i.status === "vencida" ? "danger" : i.status === "anulada" ? "muted" : "warning"}>{i.status}</Badge></Td>
                    <Td>{["emitida", "vencida"].includes(i.status) ? <ActionButton action={registerGaviaPaymentAction} payload={{ invoiceId: i.id, method: "transferencia", reference: "" }} label="Registrar pago" variant="secondary" confirmText={`¿Registrar el pago total de la factura ${i.number} por transferencia?`} /> : null}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
          <Card>
            <CardHeader title="Pagos recibidos" />
            <Table>
              <thead><tr><Th>Fecha</Th><Th>Balneario</Th><Th>Factura</Th><Th>Medio</Th><Th className="text-right">Importe</Th></tr></thead>
              <tbody>{payments.map((p) => <tr key={p.id}><Td>{formatDateTime(p.paid_at)}</Td><Td>{p.balneario}</Td><Td>N.º {p.number}</Td><Td>{p.method} <span className="text-xs text-mist">{p.reference}</span></Td><Td className="text-right tabular-nums">{usd(p.amount_cents)}</Td></tr>)}</tbody>
            </Table>
          </Card>
        </div>
        <Card className="h-fit">
          <CardHeader title="Emitir factura" description="Registro interno. La facturación electrónica (AFIP/ARCA) es una integración pendiente." />
          <CardBody>
            <QuickForm action={createInvoiceAction} columns={1} submitLabel="Emitir" fields={[
              { name: "balnearioId", label: "Balneario", type: "select", required: true, options: balnearios.map((b) => ({ value: b.id, label: b.name })), defaultValue: balnearios[0]?.id },
              { name: "mode", label: "Forma de pago", type: "select", required: true, defaultValue: "contado", options: [{ value: "contado", label: "Pago total (5 % de descuento)" }, { value: "cuotas", label: "En cuotas mensuales" }] },
              { name: "installments", label: "Cantidad de cuotas", type: "select", required: true, defaultValue: "3", options: [2, 3, 4, 6, 12].map((n) => ({ value: String(n), label: `${n} cuotas` })), showIf: { field: "mode", equals: "cuotas" } },
              { name: "dueDate", label: "Vencimiento (primera cuota)", type: "date", required: true, defaultValue: todayISO() },
            ]} />
            <p className="mt-3 text-xs text-mist">El importe sale del precio del plan del balneario. Al registrar el primer pago, el balneario pasa automáticamente de TESTING a ACTIVO.</p>
          </CardBody>
        </Card>
      </div>
    </>
  );
}

export async function GaviaReportesPage() {
  const v = await requireSuperadmin("reportes");
  const d = await asUser(v.id, async (db) => {
    const today = todayISO();
    const months = Array.from({ length: 6 }, (_, i) => startOfMonth(addMonths(today, i - 5)));
    const income = await Promise.all(months.map((m) => db.one<{ s: number }>(`select coalesce(sum(amount_cents), 0) as s from gavia_payments where to_char(local_date(paid_at), 'YYYY-MM') = $1`, [m.slice(0, 7)])));
    const stages = await db.many<{ stage: string; n: number }>(`select stage, count(*)::int as n from leads group by stage`);
    const statuses = await db.many<{ status: string; n: number }>(`select status, count(*)::int as n from balnearios group by status`);
    const plans = await db.many<{ name: string; n: number }>(`select p.name, count(*)::int as n from subscriptions s join plans p on p.id = s.plan_id where s.status in ('activa', 'prueba') group by p.name`);
    return { income: months.map((m, i) => ({ label: monthLabel(m).replace(/ de \d{4}/, ""), values: [income[i]?.s ?? 0] })), stages, statuses, plans };
  });
  return (
    <>
      <PageHeader eyebrow="Backoffice GAVIA" title="Reportes globales" description="Indicadores de GAVIA como empresa." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card><CardHeader title="Ingresos de GAVIA por mes" /><CardBody><BarGroups data={d.income} series={[{ name: "Pagos de suscripciones", className: "bg-navy" }]} format={usd} /></CardBody></Card>
        <Card><CardHeader title="Embudo comercial" /><CardBody><HBar items={STAGES.map((s) => ({ label: s.label, value: d.stages.find((x) => x.stage === s.value)?.n ?? 0 }))} format={(n) => String(n)} /></CardBody></Card>
        <Card><CardHeader title="Balnearios por estado" /><CardBody><HBar items={d.statuses.map((s) => ({ label: s.status, value: s.n }))} format={(n) => String(n)} /></CardBody></Card>
        <Card><CardHeader title="Suscripciones vigentes por plan" /><CardBody><HBar items={d.plans.map((p) => ({ label: p.name, value: p.n }))} format={(n) => String(n)} /></CardBody></Card>
      </div>
    </>
  );
}

export async function GaviaUsuariosPage({ searchParams }: { searchParams: Promise<{ balneario?: string; q?: string }> }) {
  const v = await requireSuperadmin("usuarios");
  const sp = await searchParams;
  const balnearioId = /^[0-9a-f-]{36}$/i.test(sp.balneario ?? "") ? sp.balneario! : null;
  const q = (sp.q ?? "").trim().slice(0, 80);
  const { users, balnearios } = await asUser(v.id, async (db) => ({
    users: await db.many<{ id: string; full_name: string; email: string; phone: string; platform_role: string | null; platform_permissions: string[]; is_demo: boolean; memberships: string | null }>(
      `select p.id, p.full_name, p.email, p.phone, p.platform_role, p.platform_permissions, p.is_demo,
              (select string_agg(b.name || ' (' || case m.role when 'owner' then 'dueño' else 'admin' end || ')', ', ' order by b.name)
                 from memberships m join balnearios b on b.id = m.balneario_id where m.user_id = p.id) as memberships
         from profiles p
        where ($1::text = '' or p.full_name ilike '%' || $1 || '%' or p.email ilike '%' || $1 || '%')
        order by p.platform_role nulls last, p.full_name`,
      [q],
    ),
    balnearios: await db.many<{ id: string; name: string }>(`select id, name from balnearios order by name`),
  }));
  const memberIds = balnearioId
    ? new Set((await asUser(v.id, (db) => db.many<{ user_id: string }>(`select user_id from memberships where balneario_id = $1`, [balnearioId]))).map((m) => m.user_id))
    : null;
  const team = users.filter((u) => u.platform_role === "superadmin");
  const others = users.filter((u) => u.platform_role !== "superadmin" && (!memberIds || memberIds.has(u.id)));
  return (
    <>
      <PageHeader eyebrow="Backoffice GAVIA" title="Usuarios" description="Equipo de GAVIA con permisos por sección y usuarios de los balnearios. Los cambios quedan auditados." actions={<Button size="sm" asChild><a href="#nuevo-superadmin"><ShieldPlus /> Nuevo superadmin</a></Button>} />
      <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
        <div className="space-y-4">
          <Card>
            <CardHeader title="Usuarios de balnearios" description="Se asocian desde la ficha de cada balneario." />
            <form className="flex flex-wrap items-end gap-2 border-b border-line px-5 pb-4">
              <label className="flex flex-col gap-1 text-xs font-semibold text-mist">Balneario
                <select name="balneario" defaultValue={balnearioId ?? ""} className="h-9 rounded-lg border border-line px-2 text-sm text-ink">
                  <option value="">Todos</option>
                  {balnearios.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold text-mist">Nombre o correo
                <input name="q" defaultValue={q} className="h-9 rounded-lg border border-line px-2 text-sm text-ink" />
              </label>
              <button className="h-9 rounded-lg bg-foam px-4 text-sm font-semibold text-navy">Filtrar</button>
              {balnearioId || q ? <Link href="/backoffice/usuarios" className="pb-2 text-xs font-semibold text-sea hover:underline">Limpiar</Link> : null}
            </form>
            <Table>
              <thead><tr><Th>Usuario</Th><Th>Balnearios</Th><Th>Acceso</Th></tr></thead>
              <tbody>
                {others.map((u) => (
                  <tr key={u.id} className="align-top">
                    <Td><p className="font-semibold">{u.full_name || "—"} {u.is_demo ? <DemoTag /> : null}</p><p className="text-xs text-mist">{u.email}</p>{u.phone ? <p className="text-xs text-mist">Tel. {u.phone}</p> : null}</Td>
                    <Td className="text-xs">{u.memberships ?? "—"}</Td>
                    <Td><div className="flex flex-col items-start gap-1"><UserCredentials userId={u.id} email={u.email} self={false} /><TempPasswordButton action={resetPasswordAction} payload={{ userId: u.id }} /></div></Td>
                  </tr>
                ))}
                {!others.length ? <tr><Td colSpan={3} className="py-8 text-center text-mist">No hay usuarios con ese filtro.</Td></tr> : null}
              </tbody>
            </Table>
          </Card>
          <Card>
            <CardHeader title="Equipo de GAVIA (superadmins)" description="Cada uno ve solo las secciones habilitadas. Nadie de GAVIA ve lo facturado, los cobros ni los gastos de un balneario." />
            <ul className="divide-y divide-line">
              {team.map((u) => (
                <li key={u.id} className="space-y-3 px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{u.full_name || "—"} {u.id === v.id ? <span className="text-xs text-mist">(vos)</span> : null} {u.is_demo ? <DemoTag /> : null}</p>
                      <p className="text-xs text-mist">{u.email}{u.phone ? ` · ${u.phone}` : ""}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <UserCredentials userId={u.id} email={u.email} self={u.id === v.id} />
                      {u.id !== v.id ? <TempPasswordButton action={resetPasswordAction} payload={{ userId: u.id }} /> : null}
                    </div>
                  </div>
                  <SuperadminPermissions userId={u.id} initial={u.platform_permissions ?? []} self={u.id === v.id} />
                </li>
              ))}
            </ul>
          </Card>
        </div>
        <Card className="h-fit border-sea/40 xl:sticky xl:top-4" id="nuevo-superadmin">
          <CardHeader title="Nuevo superadmin" description="Crea otra cuenta del equipo de GAVIA. Ninguna sección viene marcada: habilitá una por una las que necesita." />
          <CardBody><NewSuperadminForm /></CardBody>
        </Card>
      </div>
    </>
  );
}export async function PlanesPage() {
  const v = await requireSuperadmin("planes");
  const plans = await asUser(v.id, (db) => db.many<{ id: string; name: string; description: string; price_cents: number; billing_period: string; active: boolean; features: string[]; modules: string[] }>(`select id, name, description, price_cents, billing_period, active, features, modules from plans order by sort_order`));
  return (
    <>
      <PageHeader eyebrow="Backoffice GAVIA" title="Planes comerciales" description="Los módulos de cada plan se aplican automáticamente a los balnearios suscriptos (menú, páginas, acciones y base de datos). Definí los precios cuando estén listos." />
      <div className="grid gap-4 lg:grid-cols-3">
        {plans.map((p) => (
          <Card key={p.id}>
            <CardHeader title={p.name} description={`Facturación ${p.billing_period === "anual" ? "anual" : `por ${p.billing_period}`} · ${usd(p.price_cents)}`} action={p.active ? <Badge tone="success">Activo</Badge> : <Badge tone="muted">Inactivo</Badge>} />
            <CardBody>
              <div className="mb-4 flex flex-wrap gap-1">
                {(Object.keys(MODULE_INFO) as Module[]).map((m) => (
                  <Badge key={m} tone={p.modules.includes(m) ? "success" : "muted"}>{p.modules.includes(m) ? "✓" : "—"} {MODULE_INFO[m].label}{p.modules.includes(m) && !MODULE_INFO[m].built ? " (en desarrollo)" : ""}</Badge>
                ))}
              </div>
              <QuickForm action={updatePlanAction} hidden={{ id: p.id }} columns={1} resetOnSuccess={false} submitLabel="Guardar plan" fields={[
                { name: "name", label: "Nombre", defaultValue: p.name, required: true },
                { name: "description", label: "Descripción", type: "textarea", defaultValue: p.description },
                { name: "price", label: "Precio anual (U$D)", type: "money", defaultValue: centsToInput(p.price_cents), required: true },
                { name: "features", label: "Funcionalidades (una por línea)", type: "textarea", defaultValue: p.features.join("\n") },
                { name: "active", label: "Plan activo", type: "checkbox", defaultValue: p.active },
              ]} />
            </CardBody>
          </Card>
        ))}
      </div>
    </>
  );
}

export async function GaviaAuditPage() {
  const v = await requireSuperadmin("auditoria");
  return (
    <>
      <PageHeader eyebrow="Backoffice GAVIA" title="Auditoría" description="Acciones sensibles de todo el sistema: reservas, cancelaciones, cobros, anulaciones, roles, planos y configuración." />
      <AuditList userId={v.id} balnearioId={null} limit={300} />
    </>
  );
}
