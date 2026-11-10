import "server-only";
import type { Db } from "@/server/db";
import type { ElementKind, MapName, PlanElement, PlanSector, PlanUnit, SiteMap, UnitBooking, UnitKind } from "@/features/plano/types";

const DEFAULT_SIZE: Record<MapName, { width: number; height: number }> = {
  playa: { width: 48, height: 30 },
  cocheras: { width: 36, height: 18 },
};

export async function listUnitKinds(db: Db): Promise<UnitKind[]> {
  const rows = await db.many<{ code: string; label: string; map: MapName; default_w: number; default_h: number }>(
    `select code, label, map, default_w, default_h from unit_kinds order by sort_order`,
  );
  return rows.map((r) => ({ code: r.code, label: r.label, map: r.map, defaultW: r.default_w, defaultH: r.default_h }));
}

export async function canEditPlano(db: Db, balnearioId: string): Promise<boolean> {
  const r = await db.one<{ ok: boolean }>(`select can_edit_plano($1) as ok`, [balnearioId]);
  return !!r?.ok;
}

export async function getSiteMap(db: Db, balnearioId: string, map: MapName): Promise<SiteMap> {
  const meta = await db.one<{ width: number; height: number; version: number }>(
    `select width, height, version from site_maps where balneario_id = $1 and map = $2`,
    [balnearioId, map],
  );
  const sectors = await db.many<PlanSector>(
    `select id, name, x, y, w, h from sectors where balneario_id = $1 and map = $2 order by sort_order, name`,
    [balnearioId, map],
  );
  const elements = await db.many<PlanElement>(
    `select id, kind, label, x, y, w, h from map_elements where balneario_id = $1 and map = $2 order by created_at`,
    [balnearioId, map],
  );
  const units = await db.many<{
    id: string; kind: string; code: string; row_label: string; sector_id: string | null;
    x: number; y: number; w: number; h: number; out_of_service: boolean; out_of_service_reason: string;
  }>(
    `select id, kind, code, row_label, sector_id, x, y, w, h, out_of_service, out_of_service_reason
       from units where balneario_id = $1 and map = $2 order by code`,
    [balnearioId, map],
  );
  return {
    map,
    width: meta?.width ?? DEFAULT_SIZE[map].width,
    height: meta?.height ?? DEFAULT_SIZE[map].height,
    version: meta?.version ?? 0,
    sectors,
    elements,
    units: units.map((u) => ({
      id: u.id, kind: u.kind, code: u.code, rowLabel: u.row_label, sectorId: u.sector_id,
      x: u.x, y: u.y, w: u.w, h: u.h, outOfService: u.out_of_service, outOfServiceReason: u.out_of_service_reason,
    })),
  };
}

/** Reservas activas que se superponen con el período, por unidad. */
export async function getBookings(db: Db, balnearioId: string, from: string, to: string, map?: MapName) {
  const rows = await db.many<{
    unit_id: string; reservation_id: string; number: number; start_date: string; end_date: string;
    status: UnitBooking["status"]; customer_id: string; first_name: string; last_name: string; phone: string; holders: string | null;
    total_cents: number; paid_cents: number; balance_cents: number;
  }>(
    `select ru.unit_id, r.id as reservation_id, r.number, r.start_date, r.end_date, r.status, c.id as customer_id,
            c.first_name, c.last_name, coalesce(nullif(c.whatsapp, ''), c.phone) as phone, reservation_holders(r.id) as holders,
            r.total_cents, r.paid_cents, r.balance_cents
       from reservation_units ru
       join reservations r on r.id = ru.reservation_id
       join customers c on c.id = r.customer_id
       join units u on u.id = ru.unit_id
      where ru.balneario_id = $1 and ru.active and ru.period && daterange($2::date, $3::date, '[]')
        and ($4::text is null or u.map = $4)
      order by r.start_date`,
    [balnearioId, from, to, map ?? null],
  );
  const byUnit = new Map<string, UnitBooking[]>();
  for (const r of rows) {
    const list = byUnit.get(r.unit_id) ?? [];
    list.push({
      reservationId: r.reservation_id, number: r.number, startDate: r.start_date, endDate: r.end_date, status: r.status,
      customerId: r.customer_id, customerName: r.holders ?? `${r.first_name} ${r.last_name}`.trim(), customerPhone: r.phone,
      totalCents: r.total_cents, paidCents: r.paid_cents, balanceCents: r.balance_cents,
    });
    byUnit.set(r.unit_id, list);
  }
  return byUnit;
}

/** Unidades libres (en cualquier plano) para el período; para asociar a una reserva. */
export async function listFreeUnits(db: Db, balnearioId: string, from: string, to: string) {
  return db.many<{ id: string; code: string; kind: string; map: MapName }>(
    `select u.id, u.code, u.kind, u.map from units u
      where u.balneario_id = $1 and not u.out_of_service
        and not exists (select 1 from reservation_units ru where ru.unit_id = u.id and ru.active
                        and ru.period && daterange($2::date, $3::date, '[]'))
      order by u.map desc, u.kind, u.code`,
    [balnearioId, from, to],
  );
}

export type MapDraft = {
  map: MapName;
  width: number;
  height: number;
  version: number;
  sectors: PlanSector[];
  elements: { id: string; kind: ElementKind; label: string; x: number; y: number; w: number; h: number }[];
  units: PlanUnit[];
};

const isTemp = (id: string) => id.startsWith("tmp-");

export class PlanoError extends Error {}

/**
 * Guarda el plano completo en una transacción. Las políticas RLS exigen
 * permiso de edición (dueño o administrador autorizado). Usa control de
 * versión optimista para no pisar cambios hechos en paralelo.
 */
export async function saveSiteMap(db: Db, balnearioId: string, draft: MapDraft): Promise<number> {
  const current = await db.one<{ version: number }>(
    `select version from site_maps where balneario_id = $1 and map = $2 for update`,
    [balnearioId, draft.map],
  );
  if ((current?.version ?? 0) !== draft.version) {
    throw new PlanoError("Otra persona guardó cambios en este plano mientras lo editabas. Recargá la página para ver la última versión.");
  }
  if (!current) {
    await db.exec(`insert into site_maps (balneario_id, map, width, height, version, updated_by) values ($1, $2, $3, $4, 0, auth.uid())`, [
      balnearioId, draft.map, draft.width, draft.height,
    ]);
  }

  // Unidades a eliminar: no se permite si tienen reservas.
  const keepUnitIds = draft.units.filter((u) => !isTemp(u.id)).map((u) => u.id);
  const toDelete = await db.many<{ id: string; code: string; has_res: boolean }>(
    `select u.id, u.code, exists (select 1 from reservation_units ru where ru.unit_id = u.id) as has_res
       from units u where u.balneario_id = $1 and u.map = $2 and not (u.id = any($3::uuid[]))`,
    [balnearioId, draft.map, keepUnitIds],
  );
  const blocked = toDelete.filter((u) => u.has_res);
  if (blocked.length) {
    throw new PlanoError(
      `No se pueden eliminar unidades con reservas registradas: ${blocked.map((b) => b.code).join(", ")}. Marcalas como fuera de servicio.`,
    );
  }
  if (toDelete.length) await db.exec(`delete from units where id = any($1::uuid[])`, [toDelete.map((u) => u.id)]);

  // Sectores
  const sectorIdMap = new Map<string, string>();
  const keepSectorIds = draft.sectors.filter((s) => !isTemp(s.id)).map((s) => s.id);
  await db.exec(`delete from sectors where balneario_id = $1 and map = $2 and not (id = any($3::uuid[]))`, [balnearioId, draft.map, keepSectorIds]);
  // Nombres temporales (solo los que cambian) para permitir intercambios sin violar unicidad.
  const existingSectors = await db.many<{ id: string; name: string }>(`select id, name from sectors where balneario_id = $1 and map = $2`, [balnearioId, draft.map]);
  const sectorName = new Map(existingSectors.map((s) => [s.id, s.name]));
  const renamedSectors = draft.sectors.filter((s) => !isTemp(s.id) && sectorName.get(s.id) !== s.name).map((s) => s.id);
  if (renamedSectors.length) await db.exec(`update sectors set name = '~' || id where id = any($1::uuid[])`, [renamedSectors]);
  for (const [i, s] of draft.sectors.entries()) {
    if (isTemp(s.id)) {
      const row = await db.one<{ id: string }>(
        `insert into sectors (balneario_id, map, name, x, y, w, h, sort_order) values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
        [balnearioId, draft.map, s.name, s.x, s.y, s.w, s.h, i],
      );
      sectorIdMap.set(s.id, row!.id);
    } else {
      const row = await db.one<{ id: string }>(
        `update sectors set name = $3, x = $4, y = $5, w = $6, h = $7, sort_order = $8 where id = $1 and balneario_id = $2 and map = $9 returning id`,
        [s.id, balnearioId, s.name, s.x, s.y, s.w, s.h, i, draft.map],
      );
      if (!row) throw new PlanoError("Un sector del plano ya no existe. Recargá la página.");
      sectorIdMap.set(s.id, s.id);
    }
  }

  // Elementos no reservables
  const keepElementIds = draft.elements.filter((e) => !isTemp(e.id)).map((e) => e.id);
  await db.exec(`delete from map_elements where balneario_id = $1 and map = $2 and not (id = any($3::uuid[]))`, [balnearioId, draft.map, keepElementIds]);
  for (const e of draft.elements) {
    if (isTemp(e.id)) {
      await db.exec(`insert into map_elements (balneario_id, map, kind, label, x, y, w, h) values ($1, $2, $3, $4, $5, $6, $7, $8)`, [
        balnearioId, draft.map, e.kind, e.label, e.x, e.y, e.w, e.h,
      ]);
    } else {
      await db.exec(`update map_elements set kind = $3, label = $4, x = $5, y = $6, w = $7, h = $8 where id = $1 and balneario_id = $2`, [
        e.id, balnearioId, e.kind, e.label, e.x, e.y, e.w, e.h,
      ]);
    }
  }

  // Unidades: primero se liberan los códigos que cambian para permitir intercambios.
  const existing = await db.many<{ id: string; code: string }>(`select id, code from units where balneario_id = $1 and map = $2`, [balnearioId, draft.map]);
  const existingCode = new Map(existing.map((u) => [u.id, u.code]));
  const renamed = draft.units.filter((u) => !isTemp(u.id) && existingCode.get(u.id) !== u.code).map((u) => u.id);
  if (renamed.length) await db.exec(`update units set code = '~' || id where id = any($1::uuid[])`, [renamed]);
  for (const u of draft.units) {
    const sectorId = u.sectorId ? (sectorIdMap.get(u.sectorId) ?? null) : null;
    const params = [balnearioId, u.kind, draft.map, sectorId, u.code, u.rowLabel, u.x, u.y, u.w, u.h, u.outOfService, u.outOfServiceReason];
    if (isTemp(u.id)) {
      await db.exec(
        `insert into units (balneario_id, kind, map, sector_id, code, row_label, x, y, w, h, out_of_service, out_of_service_reason)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        params,
      );
    } else {
      const row = await db.one(
        `update units set kind = $2, sector_id = $4, code = $5, row_label = $6, x = $7, y = $8, w = $9, h = $10,
                out_of_service = $11, out_of_service_reason = $12
          where id = $13 and balneario_id = $1 and map = $3 returning id`,
        [...params, u.id],
      );
      if (!row) throw new PlanoError("Una unidad del plano ya no existe. Recargá la página.");
    }
  }

  const saved = await db.one<{ version: number }>(
    `update site_maps set width = $3, height = $4, version = version + 1, updated_at = now(), updated_by = auth.uid()
      where balneario_id = $1 and map = $2 returning version`,
    [balnearioId, draft.map, draft.width, draft.height],
  );
  if (!saved) throw new PlanoError("No tenés permiso para modificar este plano.");
  await db.exec(`select log_action($1, 'plano.guardado', 'site_maps', $2, $3)`, [
    balnearioId, draft.map, JSON.stringify({ unidades: draft.units.length, sectores: draft.sectors.length, elementos: draft.elements.length, version: saved.version }),
  ]);
  return saved.version;
}
