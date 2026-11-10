import Link from "next/link";
import { Lock, PencilRuler } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, PageHeader } from "@/components/ui/primitives";
import { requireTenant, type TenantRole } from "@/server/auth/context";
import { hasModule } from "@/lib/plan";
import { asUser } from "@/server/db";
import { canEditPlano, getBookings, getSiteMap, listUnitKinds } from "@/server/repos/plano";
import { isISODate, todayISO } from "@/lib/dates";
import { computeStatus, type MapName, type UnitOccupancy } from "./types";
import { PlanoView } from "./plano-view";
import { PlanoEditor } from "./editor";

type Search = Promise<{ vista?: string; desde?: string; hasta?: string }>;

const mapOf = (v?: string): MapName => (v === "cocheras" ? "cocheras" : "playa");

export async function PlanoPage({ role, searchParams }: { role: TenantRole; searchParams: Search }) {
  const t = await requireTenant(role);
  const sp = await searchParams;
  const map = mapOf(sp.vista);
  const today = todayISO();
  const from = isISODate(sp.desde) ? sp.desde : today;
  const to = isISODate(sp.hasta) && sp.hasta >= from ? sp.hasta : from;

  const data = await asUser(t.viewer.id, async (db) => {
    const [site, bookings, editable, kinds, season] = await Promise.all([
      getSiteMap(db, t.balnearioId, map),
      getBookings(db, t.balnearioId, from, to, map),
      canEditPlano(db, t.balnearioId),
      listUnitKinds(db),
      db.one<{ season_start: string | null; season_end: string | null }>(`select season_start, season_end from balnearios where id = $1`, [t.balnearioId]),
    ]);
    return { site, bookings, editable, kinds, season };
  });

  const showPayments = hasModule(t.modules, "pagos");
  const occupancy: Record<string, UnitOccupancy> = {};
  for (const u of data.site.units) {
    const occ = computeStatus(u, data.bookings.get(u.id) ?? []);
    occupancy[u.id] = showPayments ? occ : { ...occ, pendingPayment: false };
  }
  const basePath = `/${role}/plano`;

  return (
    <>
      <PageHeader
        eyebrow={t.balnearioName}
        title="Plano interactivo"
        description="La disponibilidad depende del período elegido: una unidad puede estar reservada en enero y libre en febrero."
        actions={
          data.editable ? (
            <Button variant="outline" asChild>
              <Link href={`${basePath}/editor?vista=${map}`}><PencilRuler /> Editar plano</Link>
            </Button>
          ) : null
        }
      />
      <PlanoView
        basePath={basePath}
        map={data.site}
        occupancy={occupancy}
        from={from}
        to={to}
        today={today}
        season={{ start: data.season?.season_start ?? null, end: data.season?.season_end ?? null }}
        kindLabels={Object.fromEntries(data.kinds.map((k) => [k.code, k.label]))}
        sectorNames={Object.fromEntries(data.site.sectors.map((s) => [s.id, s.name]))}
        showPayments={showPayments}
      />
    </>
  );
}

export async function PlanoEditorPage({ role, searchParams }: { role: TenantRole; searchParams: Search }) {
  const t = await requireTenant(role);
  const map = mapOf((await searchParams).vista);
  const data = await asUser(t.viewer.id, async (db) => {
    const editable = await canEditPlano(db, t.balnearioId);
    if (!editable) return null;
    const [site, kinds, other] = await Promise.all([
      getSiteMap(db, t.balnearioId, map),
      listUnitKinds(db),
      db.many<{ code: string }>(`select code from units where balneario_id = $1 and map <> $2`, [t.balnearioId, map]),
    ]);
    return { site, kinds, reserved: other.map((o) => o.code) };
  });

  if (!data) {
    return (
      <>
        <PageHeader title="Editor del plano" />
        <Alert tone="warning" title="Sin permiso de edición">
          <span className="inline-flex items-center gap-1"><Lock className="size-3.5" /> Podés usar el plano para la operación diaria, pero modificar su estructura requiere que el dueño te otorgue el permiso.</span>
        </Alert>
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow={t.balnearioName}
        title="Editor del plano"
        description="Diseñá la distribución real de tu balneario. Los planos de playa y de cocheras son independientes y se guardan por separado."
      />
      <PlanoEditor key={`${map}-${data.site.version}`} map={data.site} kinds={data.kinds} reservedCodes={data.reserved} basePath={`/${role}/plano`} />
    </>
  );
}
