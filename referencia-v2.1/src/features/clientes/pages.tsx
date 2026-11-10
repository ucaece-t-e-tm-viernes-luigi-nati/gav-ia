import Link from "next/link";
import { notFound } from "next/navigation";
import { MessageCircle, Phone, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardBody, CardHeader, DemoTag, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { requireTenant, type TenantRole } from "@/server/auth/context";
import { hasModule } from "@/lib/plan";
import { asUser } from "@/server/db";
import { getCustomer, listCustomers } from "@/server/repos/clientes";
import { formatMoney } from "@/lib/money";
import { formatDate, formatDateTime } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { METHOD_LABEL, RES_STATUS } from "@/features/reservas/labels";
import { CustomerDialog, InteractionForm } from "./customer-forms";

export async function ClientesPage({ role, searchParams }: { role: TenantRole; searchParams: Promise<{ q?: string; saldo?: string }> }) {
  const t = await requireTenant(role);
  const pagos = hasModule(t.modules, "pagos");
  const sp = await searchParams;
  const base = `/${role}/clientes`;
  const rows = await asUser(t.viewer.id, (db) => listCustomers(db, t.balnearioId, { q: sp.q, saldo: pagos && sp.saldo === "1" }));
  return (
    <>
      <PageHeader eyebrow={t.balnearioName} title="Clientes" description="Fichas de clientes con historial de reservas, pagos e interacciones." actions={<CustomerDialog sensitive={role === "owner"} base={base} />} />
      <Card>
        <form className="flex flex-wrap items-end gap-2 border-b border-line p-4">
          <input name="q" aria-label="Buscar cliente" defaultValue={sp.q} placeholder="Nombre, teléfono o correo" className="h-9 w-64 rounded-lg border border-line px-3 text-sm" />
          {pagos ? <label className="flex h-9 items-center gap-2 text-sm"><input type="checkbox" name="saldo" value="1" defaultChecked={sp.saldo === "1"} className="accent-navy" /> Con saldo pendiente</label> : null}
          <Button type="submit" size="sm" variant="secondary">Buscar</Button>
        </form>
        {rows.length ? (
          <Table>
            <thead><tr><Th>Cliente</Th><Th>Contacto</Th><Th className="text-right">Reservas</Th><Th>Última reserva</Th>{pagos ? <Th className="text-right">Saldo pendiente</Th> : null}</tr></thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="hover:bg-sand/30">
                  <Td><Link href={`${base}/${c.id}`} className="font-semibold text-navy hover:underline">{c.name}</Link> {c.is_demo ? <DemoTag /> : null}</Td>
                  <Td className="text-mist">{c.phone || c.email || "—"}</Td>
                  <Td className="text-right tabular-nums">{c.reservations}</Td>
                  <Td>{formatDate(c.last_start)}</Td>
                  {pagos ? <Td className={cn("text-right font-semibold tabular-nums", c.balance_cents > 0 && "text-st-busy")}>{formatMoney(c.balance_cents)}</Td> : null}
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState icon={Users} title="No encontramos clientes" description="Cargá un cliente nuevo o creá una reserva desde el plano." />
        )}
      </Card>
    </>
  );
}

export async function ClienteDetailPage({ role, id }: { role: TenantRole; id: string }) {
  const t = await requireTenant(role);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const c = await asUser(t.viewer.id, (db) => getCustomer(db, t.balnearioId, id, role));
  if (!c) notFound();
  const pagos = hasModule(t.modules, "pagos");
  const balance = c.reservations.filter((r) => r.status !== "cancelada").reduce((s, r) => s + r.balance_cents, 0);
  const phone = c.whatsapp || c.phone;
  return (
    <>
      <PageHeader
        eyebrow="Ficha de cliente"
        title={`${c.first_name} ${c.last_name}`}
        description={`Cliente desde ${formatDate(c.created_at)}`}
        actions={
          <>
            {c.is_demo ? <DemoTag /> : null}
            <CustomerDialog
              base={`/${role}/clientes`}
              sensitive={role === "owner"}
              initial={{ id: c.id, firstName: c.first_name, lastName: c.last_name, phone: c.phone, whatsapp: c.whatsapp, email: c.email, documentId: c.document_id, address: c.address, notes: c.notes }}
            />
            <Button asChild size="sm"><Link href={`/${role}/reservas/nueva`}>Nueva reserva</Link></Button>
          </>
        }
      />
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <div className="space-y-4">
          <Card>
            <CardHeader title="Contacto" />
            <CardBody className="space-y-2 text-sm">
              {phone ? <a className="flex items-center gap-2 text-sea" href={`tel:${phone.replace(/[^\d+]/g, "")}`}><Phone className="size-4" /> {phone}</a> : <p className="text-mist">Sin teléfono</p>}
              {c.email ? <p>{c.email}</p> : null}
              {role === "owner" ? (
                <>
                  <p><span className="text-mist">Documento:</span> {c.document_id || "—"}</p>
                  <p><span className="text-mist">Domicilio:</span> {c.address || "—"}</p>
                </>
              ) : null}
              {c.conversations.length ? (
                <Link href={`/${role}/conversaciones?c=${c.conversations[0].id}`} className="flex items-center gap-2 text-sea"><MessageCircle className="size-4" /> Ver conversación</Link>
              ) : null}
              <div className="border-t border-line pt-2">
                <p className="text-xs text-mist">Notas</p>
                <p className="whitespace-pre-wrap">{c.notes || "—"}</p>
              </div>
            </CardBody>
          </Card>
          {pagos ? (
            <Card>
              <CardBody>
                <p className="text-xs font-semibold uppercase tracking-wide text-mist">Saldo pendiente</p>
                <p className={cn("mt-1 text-2xl font-extrabold tabular-nums", balance > 0 ? "text-st-busy" : "text-navy")}>{formatMoney(balance)}</p>
              </CardBody>
            </Card>
          ) : null}
        </div>
        <div className="space-y-4">
          <Card>
            <CardHeader title="Reservas y unidades alquiladas" />
            {c.reservations.length ? (
              <Table>
                <thead><tr><Th>#</Th><Th>Unidades</Th><Th>Fechas</Th><Th>Estado</Th><Th className="text-right">Total</Th>{pagos ? <Th className="text-right">Saldo</Th> : null}</tr></thead>
                <tbody>
                  {c.reservations.map((r) => (
                    <tr key={r.id}>
                      <Td><Link href={`/${role}/reservas/${r.id}`} className="font-bold text-sea hover:underline">#{r.number}</Link></Td>
                      <Td>{r.units}</Td>
                      <Td className="whitespace-nowrap">{formatDate(r.start_date)} – {formatDate(r.end_date)}</Td>
                      <Td><Badge tone={RES_STATUS[r.status].tone}>{RES_STATUS[r.status].label}</Badge></Td>
                      <Td className="text-right tabular-nums">{formatMoney(r.total_cents)}</Td>
                      {pagos ? <Td className="text-right tabular-nums">{formatMoney(r.balance_cents)}</Td> : null}
                    </tr>
                  ))}
                </tbody>
              </Table>
            ) : <CardBody className="text-sm text-mist">Sin reservas.</CardBody>}
          </Card>
          {pagos ? (
          <Card>
            <CardHeader title="Historial de pagos" />
            {c.payments.length ? (
              <Table>
                <thead><tr><Th>Fecha</Th><Th>Reserva</Th><Th>Medio</Th><Th className="text-right">Importe</Th></tr></thead>
                <tbody>
                  {c.payments.map((p) => (
                    <tr key={p.id}>
                      <Td>{formatDateTime(p.paid_at)}</Td>
                      <Td>#{p.number}</Td>
                      <Td>{METHOD_LABEL[p.method] ?? p.method} {p.status === "anulado" ? <Badge tone="muted">Anulado</Badge> : null}</Td>
                      <Td className={cn("text-right tabular-nums", p.status === "anulado" && "line-through text-mist")}>{formatMoney(p.amount_cents)}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            ) : <CardBody className="text-sm text-mist">Sin pagos registrados.</CardBody>}
          </Card>
          ) : null}
          <Card>
            <CardHeader title="Interacciones" />
            <CardBody className="space-y-3">
              <InteractionForm customerId={c.id} />
              <ul className="divide-y divide-line text-sm">
                {c.interactions.map((i) => (
                  <li key={i.id} className="py-2">
                    <p><Badge tone="neutral">{i.kind}</Badge> <span className="ml-1">{i.summary}</span></p>
                    <p className="mt-0.5 text-xs text-mist">{formatDateTime(i.occurred_at)} · {i.author ?? "—"}</p>
                  </li>
                ))}
                {!c.interactions.length ? <li className="py-2 text-mist">Sin interacciones registradas.</li> : null}
              </ul>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
