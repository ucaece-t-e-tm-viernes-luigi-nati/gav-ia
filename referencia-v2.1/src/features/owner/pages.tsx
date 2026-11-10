import Link from "next/link";
import { FileSpreadsheet, FileText, Wallet } from "lucide-react";
import { Badge, Card, CardBody, CardHeader, EmptyState, PageHeader, Stat, Table, Td, Th } from "@/components/ui/primitives";
import { BarGroups, HBar } from "@/components/ui/charts";
import { requireModule, requireTenant } from "@/server/auth/context";
import { hasModule } from "@/lib/plan";
import { asUser } from "@/server/db";
import { env } from "@/server/env";
import { financeSummary, occupancy } from "@/server/repos/dashboard";
import { listPayments } from "@/server/repos/exports";
import { getIntegration } from "@/server/integrations";
import { formatMoney } from "@/lib/money";
import { addMonths, endOfMonth, formatDate, formatDateTime, isISODate, monthLabel, startOfMonth, todayISO } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { METHOD_LABEL } from "@/features/reservas/labels";
import { AddMemberForm, BalnearioForm, InvoicedToggle, MemberToggles, MercadoPagoForm, WhatsAppForm } from "./owner-client";
import { TempPasswordButton } from "@/components/ui/quick-form";
import { resetAdminPasswordAction } from "@/server/actions/owner";

type Range = Promise<{ desde?: string; hasta?: string; medio?: string; facturado?: string }>;

export async function OwnerPagosPage({ searchParams }: { searchParams: Range }) {
  const t = await requireModule("owner", "pagos");
  const sp = await searchParams;
  const today = todayISO();
  const facturado = sp.facturado === "si" || sp.facturado === "no" ? sp.facturado : "";
  const d = await asUser(t.viewer.id, async (db) => {
    const season = await db.one<{ season_start: string | null; season_end: string | null }>(`select season_start, season_end from balnearios where id = $1`, [t.balnearioId]);
    const from = isISODate(sp.desde) ? sp.desde : startOfMonth(today);
    const to = isISODate(sp.hasta) ? sp.hasta : endOfMonth(today);
    const rows = await listPayments(db, t.balnearioId, { from, to, method: sp.medio || null, invoiced: facturado || null });
    const fin = await financeSummary(db, t.balnearioId, from, to);
    return { season, from, to, rows, fin };
  });
  const approved = d.rows.filter((p) => p.status === "aprobado");
  const withInvoice = approved.filter((p) => p.invoiced).reduce((s, p) => s + Number(p.amount_cents), 0);
  const withoutInvoice = approved.filter((p) => !p.invoiced).reduce((s, p) => s + Number(p.amount_cents), 0);
  const byClient = new Map<string, { name: string; total: number; invoiced: number }>();
  for (const p of approved) {
    const c = byClient.get(p.customer_id) ?? { name: p.customer, total: 0, invoiced: 0 };
    c.total += Number(p.amount_cents);
    if (p.invoiced) c.invoiced += Number(p.amount_cents);
    byClient.set(p.customer_id, c);
  }
  const clients = [...byClient.values()].sort((a, b) => b.total - a.total);
  const qs = (formato: string) => new URLSearchParams({ formato, desde: d.from, hasta: d.to, ...(sp.medio ? { medio: sp.medio } : {}), ...(facturado ? { facturado } : {}) }).toString();
  const seasonLink = d.season?.season_start && d.season.season_end ? `?desde=${d.season.season_start}&hasta=${d.season.season_end}${facturado ? `&facturado=${facturado}` : ""}` : null;
  return (
    <>
      <PageHeader
        eyebrow={t.balnearioName}
        title="Cobros y pagos"
        description={`Del ${formatDate(d.from)} al ${formatDate(d.to)}. Marcá cada cobro como facturado cuando emitas el comprobante al cliente.`}
        actions={<ExportButtons base="/owner/pagos/exportar" query={qs} />}
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Ventas del período (reservas)" value={formatMoney(d.fin.facturacion)} />
        <Stat label="Cobrado en el período" value={formatMoney(d.fin.cobros)} tone="free" />
        <Stat label="Cobrado con factura" value={formatMoney(withInvoice)} hint={facturado ? "Según el filtro aplicado" : undefined} />
        <Stat label="Cobrado sin factura" value={formatMoney(withoutInvoice)} tone="busy" hint={facturado ? "Según el filtro aplicado" : undefined} />
      </div>
      <Card>
        <form className="flex flex-wrap items-end gap-2 border-b border-line p-4">
          <label className="flex flex-col gap-1 text-xs font-semibold text-mist">Desde<input type="date" name="desde" defaultValue={d.from} className="h-9 rounded-lg border border-line px-2 text-sm text-ink" /></label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-mist">Hasta<input type="date" name="hasta" defaultValue={d.to} className="h-9 rounded-lg border border-line px-2 text-sm text-ink" /></label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-mist">Medio
            <select name="medio" defaultValue={sp.medio ?? ""} className="h-9 rounded-lg border border-line px-2 text-sm text-ink">
              <option value="">Todos</option>
              {Object.entries(METHOD_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-mist">Facturación
            <select name="facturado" defaultValue={facturado} className="h-9 rounded-lg border border-line px-2 text-sm text-ink">
              <option value="">Todos</option>
              <option value="si">Facturados</option>
              <option value="no">Sin facturar</option>
            </select>
          </label>
          <button className="h-9 rounded-lg bg-foam px-4 text-sm font-semibold text-navy">Filtrar</button>
          {seasonLink ? <Link href={seasonLink} className="pb-2 text-xs font-semibold text-sea hover:underline">Ver toda la temporada</Link> : null}
        </form>
        {d.rows.length ? (
          <Table>
            <thead><tr><Th>Fecha</Th><Th>Reserva</Th><Th>Cliente</Th><Th>Medio</Th><Th>Registró</Th><Th>Estado</Th><Th>Factura</Th><Th className="text-right">Importe</Th></tr></thead>
            <tbody>
              {d.rows.map((p) => (
                <tr key={p.id}>
                  <Td className="whitespace-nowrap">{formatDateTime(p.paid_at)}</Td>
                  <Td><Link className="font-semibold text-sea hover:underline" href={`/owner/reservas/${p.reservation_id}`}>#{p.number}</Link></Td>
                  <Td>{p.customer}</Td>
                  <Td>{METHOD_LABEL[p.method] ?? p.method}{p.provider_payment_id ? <p className="max-w-32 truncate text-[11px] text-mist">{p.provider_payment_id}</p> : null}</Td>
                  <Td className="text-mist">{p.author ?? "—"}</Td>
                  <Td>{p.status === "anulado" ? <Badge tone="muted">Anulado</Badge> : <Badge tone="success">Aprobado</Badge>}</Td>
                  <Td><InvoicedToggle paymentId={p.id} invoiced={p.invoiced} invoiceRef={p.invoice_ref} disabled={p.status === "anulado"} /></Td>
                  <Td className={cn("text-right tabular-nums", p.status === "anulado" && "text-mist line-through")}>{formatMoney(p.amount_cents)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState icon={Wallet} title="Sin transacciones en el período" />
        )}
      </Card>
      {clients.length ? (
        <Card className="mt-4">
          <CardHeader title="Por cliente" description="Cuánto pagó cada cliente en el período y cuánto de eso está facturado." />
          <Table>
            <thead><tr><Th>Cliente</Th><Th className="text-right">Pagó</Th><Th className="text-right">Facturado</Th><Th className="text-right">Sin facturar</Th><Th /></tr></thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.name + c.total}>
                  <Td className="font-semibold">{c.name}</Td>
                  <Td className="text-right tabular-nums">{formatMoney(c.total)}</Td>
                  <Td className="text-right tabular-nums">{formatMoney(c.invoiced)}</Td>
                  <Td className={cn("text-right tabular-nums", c.total - c.invoiced > 0 && "text-st-busy")}>{formatMoney(c.total - c.invoiced)}</Td>
                  <Td>{c.invoiced === c.total ? <Badge tone="success">Todo facturado</Badge> : c.invoiced === 0 ? <Badge tone="warning">Sin facturar</Badge> : <Badge tone="info">Parcial</Badge>}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      ) : null}
    </>
  );
}

/** Botones de exportación (Excel / PDF) con los filtros vigentes. */
export function ExportButtons({ base, query }: { base: string; query: (formato: string) => string }) {
  return (
    <span className="flex gap-2">
      <a href={`${base}?${query("xlsx")}`} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-white px-3 text-sm font-semibold text-navy hover:bg-sand/50"><FileSpreadsheet className="size-4" /> Excel</a>
      <a href={`${base}?${query("pdf")}`} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-white px-3 text-sm font-semibold text-navy hover:bg-sand/50"><FileText className="size-4" /> PDF</a>
    </span>
  );
}
export async function OwnerReportesPage({ searchParams }: { searchParams: Range }) {
  const t = await requireModule("owner", "ocupacion");
  const pagos = hasModule(t.modules, "pagos");
  const sp = await searchParams;
  const d = await asUser(t.viewer.id, async (db) => {
    const b = await db.one<{ season_start: string | null; season_end: string | null }>(`select season_start, season_end from balnearios where id = $1`, [t.balnearioId]);
    const today = todayISO();
    const from = isISODate(sp.desde) ? sp.desde : (b?.season_start ?? startOfMonth(addMonths(today, -2)));
    const to = isISODate(sp.hasta) ? sp.hasta : (b?.season_end ?? endOfMonth(addMonths(today, 3)));
    const fin = await financeSummary(db, t.balnearioId, from, to);
    const months: { label: string; pct: number }[] = [];
    for (let m = startOfMonth(from); m <= to && months.length < 12; m = addMonths(m, 1)) {
      const o = await occupancy(db, t.balnearioId, m, endOfMonth(m));
      months.push({ label: monthLabel(m), pct: o.pct });
    }
    const byKind = await db.many<{ kind: string; total: number }>(
      `select u.kind, sum(r.total_cents / (select count(*) from reservation_units x where x.reservation_id = r.id))::bigint as total
         from reservations r join reservation_units ru on ru.reservation_id = r.id join units u on u.id = ru.unit_id
        where r.balneario_id = $1 and r.status <> 'cancelada' and r.start_date between $2 and $3 group by u.kind`,
      [t.balnearioId, from, to],
    );
    return { from, to, fin, months, byKind };
  });
  return (
    <>
      <PageHeader eyebrow={t.balnearioName} title="Reportes financieros" description={`Del ${formatDate(d.from)} al ${formatDate(d.to)}. Facturación: reservas no canceladas que comienzan en el período. Cobros: pagos aprobados por fecha de cobro.`} />
      <form className="mb-4 flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs font-semibold text-mist">Desde<input type="date" name="desde" defaultValue={d.from} className="h-9 rounded-lg border border-line px-2 text-sm text-ink" /></label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-mist">Hasta<input type="date" name="hasta" defaultValue={d.to} className="h-9 rounded-lg border border-line px-2 text-sm text-ink" /></label>
        <button className="h-9 rounded-lg bg-foam px-4 text-sm font-semibold text-navy">Aplicar</button>
      </form>
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Facturación" value={formatMoney(d.fin.facturacion)} />
        {pagos ? <Stat label="Cobros" value={formatMoney(d.fin.cobros)} tone="free" /> : null}
        {pagos ? <Stat label="Saldo pendiente" value={formatMoney(d.fin.saldo_pendiente)} tone="busy" /> : null}
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title={pagos ? "Facturación y cobros por mes" : "Facturación por mes"} />
          <CardBody>
            <BarGroups
              data={d.fin.por_mes.map((m) => ({ label: monthLabel(`${m.mes}-01`).replace(/ de \d{4}/, ""), values: pagos ? [m.facturacion, m.cobros] : [m.facturacion] }))}
              series={pagos ? [{ name: "Facturación", className: "bg-navy" }, { name: "Cobros", className: "bg-sea/60" }] : [{ name: "Facturación", className: "bg-navy" }]}
              format={formatMoney}
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Ocupación por mes" description="Días-unidad confirmados sobre capacidad disponible" />
          <CardBody>
            <BarGroups data={d.months.map((m) => ({ label: m.label.replace(/ de \d{4}/, ""), values: [m.pct] }))} series={[{ name: "Ocupación %", className: "bg-st-free" }]} format={(n) => `${n}%`} />
          </CardBody>
        </Card>
        {pagos ? (
          <Card>
            <CardHeader title="Cobros por medio de pago" />
            <CardBody><HBar items={Object.entries(d.fin.por_medio).map(([k, v]) => ({ label: METHOD_LABEL[k] ?? k, value: v }))} format={formatMoney} /></CardBody>
          </Card>
        ) : null}
        <Card>
          <CardHeader title="Facturación por tipo de unidad" description="Reservas con varias unidades se prorratean en partes iguales." />
          <CardBody><HBar items={d.byKind.map((k) => ({ label: k.kind[0].toUpperCase() + k.kind.slice(1) + "s", value: k.total }))} format={formatMoney} /></CardBody>
        </Card>
      </div>
    </>
  );
}

export async function OwnerUsuariosPage() {
  const t = await requireTenant("owner");
  const members = await asUser(t.viewer.id, (db) =>
    db.many<{ id: string; role: string; active: boolean; can_edit_plano: boolean; full_name: string; email: string; phone: string; user_id: string }>(
      `select m.id, m.role, m.active, m.can_edit_plano, p.full_name, p.email, p.phone, p.id as user_id from memberships m join profiles p on p.id = m.user_id
        where m.balneario_id = $1 order by m.role desc, p.full_name`,
      [t.balnearioId],
    ),
  );
  return (
    <>
      <PageHeader eyebrow={t.balnearioName} title="Usuarios del balneario" description="Dueños y administradores. Los dueños ven toda la información, incluida la financiera; los administradores solo el panel operativo." />
      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <Card>
          <ul className="divide-y divide-line">
            {members.map((m) => {
              const self = m.user_id === t.viewer.id;
              return (
                <li key={m.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-semibold">{m.full_name || m.email} {self ? <span className="text-xs text-mist">(vos)</span> : null}</p>
                    <p className="text-xs text-mist">{m.email}{m.phone ? ` · ${m.phone}` : ""}</p>
                    <div className="mt-1 flex gap-1">
                      <Badge tone={m.role === "owner" ? "info" : "neutral"}>{m.role === "owner" ? "Dueño" : "Administrador"}</Badge>
                      {!m.active ? <Badge tone="muted">Inactivo</Badge> : null}
                    </div>
                  </div>
                  <div className="flex flex-col items-start gap-1 sm:items-end">
                    <MemberToggles membershipId={m.id} active={m.active} canEditPlano={m.can_edit_plano} role={m.role} self={self} />
                    {!self ? <TempPasswordButton action={resetAdminPasswordAction} payload={{ membershipId: m.id }} /> : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
        <Card className="h-fit">
          <CardHeader title="Agregar usuario" description="Dueño o administrador" />
          <CardBody><AddMemberForm /></CardBody>
        </Card>
      </div>
    </>
  );
}

export async function OwnerConfigPage() {
  const t = await requireTenant("owner");
  const d = await asUser(t.viewer.id, async (db) => ({
    b: await db.one<{ name: string; city: string; address: string; phone: string; email: string; season_start: string | null; season_end: string | null; status: string; slug: string }>(
      `select name, city, address, phone, email, season_start, season_end, status, slug from balnearios where id = $1`, [t.balnearioId]),
    mp: await getIntegration(db, t.balnearioId, "mercadopago"),
    wa: await getIntegration(db, t.balnearioId, "whatsapp"),
    sub: await db.one<{ plan: string; status: string; current_period_end: string }>(
      `select p.name as plan, s.status, s.current_period_end from subscriptions s join plans p on p.id = s.plan_id where s.balneario_id = $1 order by s.created_at desc limit 1`, [t.balnearioId]),
  }));
  return (
    <>
      <PageHeader eyebrow={t.balnearioName} title="Configuración" description="Datos del establecimiento e integraciones. Las credenciales se guardan cifradas y nunca se muestran ni se envían al navegador." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Datos del balneario" description={`Estado comercial: ${d.b?.status} · gestionado por GAVIA`} />
          <CardBody>
            <BalnearioForm initial={{ name: d.b!.name, city: d.b!.city, address: d.b!.address, phone: d.b!.phone, email: d.b!.email, seasonStart: d.b!.season_start ?? "", seasonEnd: d.b!.season_end ?? "" }} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Plano del balneario" />
          <CardBody className="space-y-3 text-sm">
            <p>Diseñá los planos de playa y de cocheras, con sectores, pasillos y unidades numeradas.</p>
            <div className="flex gap-2">
              <Link className="font-semibold text-sea hover:underline" href="/owner/plano/editor?vista=playa">Editar plano de playa</Link>
              <span className="text-mist">·</span>
              <Link className="font-semibold text-sea hover:underline" href="/owner/plano/editor?vista=cocheras">Editar plano de cocheras</Link>
            </div>
            <p className="text-xs text-mist">Para que un administrador pueda editar el plano, habilitalo en Usuarios.</p>
            {d.sub ? <p className="border-t border-line pt-3">Suscripción GAVIA: <strong>{d.sub.plan}</strong> · {d.sub.status} hasta {formatDate(d.sub.current_period_end)}</p> : null}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Mercado Pago · cobros con QR" description="API de Orders, QR dinámico por caja" />
          <CardBody>
            {hasModule(t.modules, "pagos") ? (
              <MercadoPagoForm status={d.mp?.status ?? "pendiente"} externalPosId={d.mp?.publicConfig.externalPosId ?? ""} hasSecret={!!d.mp?.hasSecret} balnearioId={t.balnearioId} appUrl={env.appUrl} />
            ) : <p className="text-sm text-mist">La integración de pagos está incluida en el plan PLUS.</p>}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="WhatsApp Business" description="Cloud API de Meta" />
          <CardBody>
            {hasModule(t.modules, "whatsapp") ? (
              <WhatsAppForm status={d.wa?.status ?? "pendiente"} phoneNumberId={d.wa?.publicConfig.phoneNumberId ?? ""} hasSecret={!!d.wa?.hasSecret} balnearioId={t.balnearioId} appUrl={env.appUrl} />
            ) : <p className="text-sm text-mist">WhatsApp integrado está incluido en los planes PRO y PLUS.</p>}
          </CardBody>
        </Card>
      </div>
    </>
  );
}

export async function AuditList({ userId, balnearioId, limit = 200 }: { userId: string; balnearioId: string | null; limit?: number }) {
  const rows = await asUser(userId, (db) =>
    db.many<{ id: number; action: string; entity: string; entity_id: string | null; data: Record<string, unknown>; created_at: string; actor: string | null; balneario: string | null }>(
      `select a.id, a.action, a.entity, a.entity_id, a.data, a.created_at, p.full_name as actor, b.name as balneario
         from audit_log a left join profiles p on p.id = a.actor_id left join balnearios b on b.id = a.balneario_id
        where ($1::uuid is null or a.balneario_id = $1) order by a.created_at desc limit $2`,
      [balnearioId, limit],
    ),
  );
  return (
    <Card>
      <Table>
        <thead><tr><Th>Fecha</Th><Th>Acción</Th>{balnearioId ? null : <Th>Balneario</Th>}<Th>Usuario</Th><Th>Detalle</Th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="align-top">
              <Td className="whitespace-nowrap text-xs">{formatDateTime(r.created_at)}</Td>
              <Td><Badge tone={r.action.includes("cancel") || r.action.includes("void") || r.action.includes("delete") ? "danger" : "neutral"}>{r.action}</Badge></Td>
              {balnearioId ? null : <Td className="text-xs">{r.balneario ?? "GAVIA"}</Td>}
              <Td className="text-xs">{r.actor ?? "Sistema"}</Td>
              <Td><details className="text-xs"><summary className="cursor-pointer text-sea">Ver cambios</summary><pre className="mt-1 max-w-xl overflow-x-auto whitespace-pre-wrap rounded bg-sand/50 p-2 text-[11px]">{JSON.stringify(r.data, null, 1).slice(0, 2000)}</pre></details></Td>
            </tr>
          ))}
          {!rows.length ? <tr><Td colSpan={5} className="py-8 text-center text-mist">Sin registros.</Td></tr> : null}
        </tbody>
      </Table>
    </Card>
  );
}

export async function OwnerAuditPage() {
  const t = await requireTenant("owner");
  return (
    <>
      <PageHeader eyebrow={t.balnearioName} title="Actividad y auditoría" description="Registro inalterable de reservas, cancelaciones, cobros, anulaciones, cambios del plano y de usuarios." />
      <AuditList userId={t.viewer.id} balnearioId={t.balnearioId} />
    </>
  );
}
