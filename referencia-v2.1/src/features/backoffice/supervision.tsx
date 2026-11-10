import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, Badge, Card, CardBody, CardHeader, DemoTag, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { requireSuperadmin } from "@/server/auth/context";
import { asUser } from "@/server/db";
import { getBookings, getSiteMap } from "@/server/repos/plano";
import { listAgenda } from "@/server/repos/agenda";
import { computeStatus, MAPS, type MapName, type UnitOccupancy } from "@/features/plano/types";
import { RES_STATUS } from "@/features/reservas/labels";
import { addDays, formatDate, formatDateTime, isISODate, todayISO } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { groupPeriods, matchPeriod, seasonPeriods } from "@/lib/periods";
import { SupervisionMap } from "./supervision-map";

const TABS = [
  { id: "plano", label: "Plano" },
  { id: "reservas", label: "Reservas" },
  { id: "clientes", label: "Clientes" },
  { id: "calendario", label: "Calendario" },
  { id: "usuarios", label: "Usuarios" },
] as const;

type Search = Promise<{ tab?: string; vista?: string; fecha?: string; desde?: string; hasta?: string; periodo?: string; q?: string }>;

/**
 * Supervisión de un balneario por el equipo de GAVIA: ve lo mismo que el dueño
 * para dar soporte, pero sin importes. La base de datos además le impide leer
 * cobros, resúmenes financieros y gastos (políticas RLS).
 */
export async function SupervisionPage({ id, searchParams }: { id: string; searchParams: Search }) {
  const v = await requireSuperadmin("balnearios");
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const sp = await searchParams;
  const tab = TABS.find((t) => t.id === sp.tab)?.id ?? "plano";
  const map: MapName = sp.vista === "cocheras" ? "cocheras" : "playa";
  const today = todayISO();
  // Disponibilidad por rango: período predeterminado (temporada, mes o quincena) o fechas específicas.
  const periods = seasonPeriods(today);
  const preset = periods.find((p) => p.key === sp.periodo);
  const from = preset?.from ?? (isISODate(sp.desde) ? sp.desde : isISODate(sp.fecha) ? sp.fecha : today);
  const to = preset?.to ?? (isISODate(sp.hasta) && sp.hasta >= from ? sp.hasta : from);
  const current = matchPeriod(periods, from, to);
  const base = `/backoffice/balnearios/${id}/supervision`;

  const d = await asUser(v.id, async (db) => {
    const b = await db.one<{ name: string; city: string; status: string; is_demo: boolean }>(`select name, city, status, is_demo from balnearios where id = $1`, [id]);
    if (!b) return null;
    if (tab === "plano") {
      const [site, bookings] = await Promise.all([getSiteMap(db, id, map), getBookings(db, id, from, to, map)]);
      const occupancy: Record<string, UnitOccupancy> = {};
      // Se descartan los importes antes de enviarlos al navegador.
      for (const u of site.units) {
        const occ = computeStatus(u, (bookings.get(u.id) ?? []).map((x) => ({ ...x, totalCents: 0, paidCents: 0, balanceCents: 0 })));
        occupancy[u.id] = { ...occ, pendingPayment: false };
      }
      const units = site.units.filter((u) => !u.outOfService);
      const free = units.filter((u) => occupancy[u.id]?.status === "disponible").map((u) => u.code).sort((a, c) => a.localeCompare(c, "es", { numeric: true }));
      return { b, site, occupancy, free, total: units.length };
    }
    if (tab === "reservas") {
      const rows = await db.many<{ id: string; number: number; start_date: string; end_date: string; status: string; customer: string; units: string }>(
        `select r.id, r.number, r.start_date, r.end_date, r.status, trim(c.first_name || ' ' || c.last_name) as customer,
                coalesce((select string_agg(u.code, ', ' order by u.code) from reservation_units ru join units u on u.id = ru.unit_id where ru.reservation_id = r.id), '') as units
           from reservations r join customers c on c.id = r.customer_id
          where r.balneario_id = $1 and ($2::text is null or (c.first_name || ' ' || c.last_name) ilike '%' || $2 || '%')
          order by r.start_date desc limit 300`,
        [id, sp.q?.trim() || null],
      );
      return { b, rows };
    }
    if (tab === "clientes") {
      const customers = await db.many<{ id: string; name: string; phone: string; email: string; reservations: number }>(
        `select c.id, trim(c.first_name || ' ' || c.last_name) as name, coalesce(nullif(c.whatsapp, ''), c.phone) as phone, c.email,
                (select count(*) from reservations r where r.customer_id = c.id and r.status <> 'cancelada')::int as reservations
           from customers c where c.balneario_id = $1 and ($2::text is null or (c.first_name || ' ' || c.last_name) ilike '%' || $2 || '%')
          order by c.last_name limit 300`,
        [id, sp.q?.trim() || null],
      );
      return { b, customers };
    }
    if (tab === "calendario") {
      const items = await listAgenda(db, { scope: "balneario", balnearioId: id }, today, addDays(today, 30), base);
      return { b, items: items.sort((a, c) => a.at.localeCompare(c.at)) };
    }
    const members = await db.many<{ full_name: string; email: string; role: string; active: boolean }>(
      `select p.full_name, p.email, m.role, m.active from memberships m join profiles p on p.id = m.user_id where m.balneario_id = $1 order by m.role desc, p.full_name`,
      [id],
    );
    return { b, members };
  });
  if (!d) notFound();

  return (
    <>
      <PageHeader
        eyebrow="Supervisión"
        title={d.b.name}
        description={`${d.b.city} · vista de soporte del equipo GAVIA`}
        actions={<>{d.b.is_demo ? <DemoTag /> : null}<Button variant="outline" size="sm" asChild><Link href={`/backoffice/balnearios/${id}`}><ArrowLeft /> Ficha del balneario</Link></Button></>}
      />
      <Alert tone="info" title="Información confidencial del balneario" className="mb-4">
        <span className="inline-flex items-center gap-1"><ShieldCheck className="size-3.5" /> En la supervisión no se muestran importes, facturación, cobros ni gastos. Es solo de lectura.</span>
      </Alert>
      <nav className="mb-4 flex flex-wrap gap-1 rounded-xl border border-line bg-white p-1" aria-label="Secciones">
        {TABS.map((t) => (
          <Link key={t.id} href={`${base}?tab=${t.id}`} aria-current={t.id === tab ? "page" : undefined} className={cn("rounded-lg px-4 py-2 text-sm font-semibold", t.id === tab ? "bg-navy text-white" : "text-mist hover:text-navy")}>
            {t.label}
          </Link>
        ))}
      </nav>

      {"site" in d && d.site ? (
        <div className="space-y-3">
          <form className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="tab" value="plano" />
            <div className="flex rounded-lg border border-line bg-white p-0.5">
              {MAPS.map((m) => (
                <Link key={m.id} href={`${base}?tab=plano&vista=${m.id}&desde=${from}&hasta=${to}`} className={cn("rounded-md px-3 py-1.5 text-sm font-semibold", m.id === map ? "bg-navy text-white" : "text-mist")}>{m.label}</Link>
              ))}
            </div>
            <input type="hidden" name="vista" value={map} />
            <label className="flex flex-col gap-1 text-xs font-semibold text-mist">Período
              <select name="periodo" defaultValue={current?.key ?? ""} className="h-9 rounded-lg border border-line px-2 text-sm text-ink">
                <option value="">Rango de fechas específico</option>
                {groupPeriods(periods).map((g) => (
                  <optgroup key={g.group} label={g.group}>{g.items.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}</optgroup>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-mist">Desde<input type="date" name="desde" defaultValue={from} className="h-9 rounded-lg border border-line px-2 text-sm text-ink" /></label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-mist">Hasta<input type="date" name="hasta" defaultValue={to} className="h-9 rounded-lg border border-line px-2 text-sm text-ink" /></label>
            <button className="h-9 rounded-lg bg-foam px-4 text-sm font-semibold text-navy">Ver disponibilidad</button>
          </form>
          <p className="text-xs text-mist">Si elegís un período, se usan sus fechas; para un rango propio dejá “Rango de fechas específico”.</p>
          <Card>
            <CardHeader
              title={`Disponibilidad del ${formatDate(from)} al ${formatDate(to)}`}
              description={`${d.free.length} de ${d.total} unidades libres durante todo el período (${map === "playa" ? "playa" : "cocheras"}). Una unidad con cualquier reserva en esas fechas no figura como libre.`}
            />
            <CardBody className="flex flex-wrap gap-1">
              {d.free.length ? d.free.map((code) => <Badge key={code} tone="success">{code}</Badge>) : <span className="text-sm text-mist">No hay unidades libres en todo el período.</span>}
            </CardBody>
          </Card>
          <SupervisionMap map={d.site} occupancy={d.occupancy} />
        </div>
      ) : null}

      {"rows" in d && d.rows ? (
        <Card>
          <SearchBox base={base} tab="reservas" q={sp.q} />
          <Table>
            <thead><tr><Th>#</Th><Th>Cliente</Th><Th>Unidades</Th><Th>Fechas</Th><Th>Estado</Th></tr></thead>
            <tbody>
              {d.rows.map((r) => (
                <tr key={r.id}>
                  <Td className="font-bold">#{r.number}</Td><Td>{r.customer}</Td><Td className="text-mist">{r.units}</Td>
                  <Td className="whitespace-nowrap">{formatDate(r.start_date)} – {formatDate(r.end_date)}</Td>
                  <Td><Badge tone={RES_STATUS[r.status]?.tone ?? "neutral"}>{RES_STATUS[r.status]?.label ?? r.status}</Badge></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      ) : null}

      {"customers" in d && d.customers ? (
        <Card>
          <SearchBox base={base} tab="clientes" q={sp.q} />
          <Table>
            <thead><tr><Th>Cliente</Th><Th>Contacto</Th><Th className="text-right">Reservas</Th></tr></thead>
            <tbody>
              {d.customers.map((c) => <tr key={c.id}><Td className="font-medium">{c.name}</Td><Td className="text-mist">{c.phone || c.email || "—"}</Td><Td className="text-right">{c.reservations}</Td></tr>)}
            </tbody>
          </Table>
        </Card>
      ) : null}

      {"items" in d && d.items ? (
        <Card>
          <CardHeader title="Próximos 30 días" description="Recordatorios, eventos, ingresos y salidas." />
          <ul className="divide-y divide-line text-sm">
            {d.items.map((i) => (
              <li key={i.id} className="flex gap-3 px-5 py-2.5">
                <span className="w-36 shrink-0 text-xs text-mist">{i.allDay ? formatDate(i.at) : formatDateTime(i.at)}</span>
                <span><span className="font-medium">{i.title}</span>{i.description ? <span className="block text-xs text-mist">{i.description}</span> : null}</span>
              </li>
            ))}
            {!d.items.length ? <li className="px-5 py-6 text-center text-mist">Sin actividades próximas.</li> : null}
          </ul>
        </Card>
      ) : null}

      {"members" in d && d.members ? (
        <Card>
          <Table>
            <thead><tr><Th>Usuario</Th><Th>Rol</Th><Th>Estado</Th></tr></thead>
            <tbody>
              {d.members.map((m) => <tr key={m.email}><Td><p className="font-medium">{m.full_name}</p><p className="text-xs text-mist">{m.email}</p></Td><Td>{m.role === "owner" ? "Dueño" : "Administrador"}</Td><Td>{m.active ? <Badge tone="success">Activo</Badge> : <Badge tone="muted">Inactivo</Badge>}</Td></tr>)}
            </tbody>
          </Table>
        </Card>
      ) : null}
    </>
  );
}

function SearchBox({ base, tab, q }: { base: string; tab: string; q?: string }) {
  return (
    <form action={base} className="flex gap-2 border-b border-line p-3">
      <input type="hidden" name="tab" value={tab} />
      <input name="q" defaultValue={q} aria-label="Buscar" placeholder="Buscar por nombre" className="h-9 w-64 rounded-lg border border-line px-3 text-sm" />
      <button className="h-9 rounded-lg bg-foam px-4 text-sm font-semibold text-navy">Buscar</button>
    </form>
  );
}
