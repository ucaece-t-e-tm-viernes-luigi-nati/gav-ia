"use client";

import * as React from "react";
import { MapCanvas, PlanoLegend, type Selection } from "@/features/plano/map-canvas";
import { computeStatus, STATUS_META, type PlanElement, type PlanSector, type PlanUnit, type UnitBooking, type UnitOccupancy } from "@/features/plano/types";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

// Ilustración del producto con datos de ejemplo (no son clientes reales).
const sectors: PlanSector[] = [
  { id: "s1", name: "Carpas", x: 1, y: 2, w: 30, h: 9 },
  { id: "s2", name: "Sombrillas", x: 1, y: 12, w: 30, h: 4 },
];
const elements: PlanElement[] = [
  { id: "e1", kind: "acceso", label: "Ingreso", x: 0, y: 0, w: 32, h: 1 },
  { id: "e2", kind: "mar", label: "Mar", x: 0, y: 17, w: 32, h: 3 },
];
const units: PlanUnit[] = [
  ...Array.from({ length: 14 }, (_, i) => ({
    id: `c${i + 1}`, kind: "carpa", code: `Carpa ${String(i + 1).padStart(2, "0")}`, rowLabel: i < 7 ? "A" : "B", sectorId: "s1",
    x: 3 + (i % 7) * 4, y: i < 7 ? 3 : 7, w: 3, h: 3, outOfService: i === 12, outOfServiceReason: "",
  })),
  ...Array.from({ length: 9 }, (_, i) => ({
    id: `s${i + 1}`, kind: "sombrilla", code: `Sombrilla ${String(i + 1).padStart(2, "0")}`, rowLabel: "C", sectorId: "s2",
    x: 3 + i * 3, y: 13, w: 2, h: 2, outOfService: false, outOfServiceReason: "",
  })),
];
const sample = (status: UnitBooking["status"], total: number, paid: number, name: string): UnitBooking[] => [
  { reservationId: name, number: 0, startDate: "2027-01-01", endDate: "2027-01-15", status, customerId: "", customerName: name, customerPhone: "", totalCents: total, paidCents: paid, balanceCents: total - paid },
];
const bookings: Record<string, UnitBooking[]> = {
  c1: sample("confirmada", 120000000, 120000000, "Cliente de ejemplo A"),
  c2: sample("confirmada", 95000000, 40000000, "Cliente de ejemplo B"),
  c5: sample("pendiente", 80000000, 0, "Cliente de ejemplo C"),
  c9: sample("confirmada", 130000000, 130000000, "Cliente de ejemplo D"),
  c10: sample("pendiente", 90000000, 20000000, "Cliente de ejemplo E"),
  s3: sample("confirmada", 30000000, 30000000, "Cliente de ejemplo F"),
  s6: sample("pendiente", 28000000, 0, "Cliente de ejemplo G"),
};

export function MiniPlano({ compact }: { compact?: boolean }) {
  const occupancy = React.useMemo(() => {
    const o: Record<string, UnitOccupancy> = {};
    for (const u of units) o[u.id] = computeStatus(u, bookings[u.id] ?? []);
    return o;
  }, []);
  const [sel, setSel] = React.useState<Selection | null>({ type: "unit", id: "c2" });
  const unit = units.find((u) => u.id === sel?.id);
  const occ = unit ? occupancy[unit.id] : undefined;
  const b = occ?.bookings[0];

  return (
    <div className={cn("grid gap-3", compact ? "" : "md:grid-cols-[1fr_210px]")}>
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-bold text-navy">Plano de playa · 1 al 15 de enero</span>
          <span className="rounded-full bg-sand px-2 py-0.5 text-[10px] font-semibold text-mist">Ilustración</span>
        </div>
        <div className="overflow-hidden rounded-lg">
          <MapCanvas
            ariaLabel="Ejemplo ilustrativo del plano interactivo"
            className="!min-w-0"
            width={32}
            height={20}
            sectors={sectors}
            elements={elements}
            units={units}
            occupancy={occupancy}
            selected={sel}
            onSelect={(s) => s?.type === "unit" && setSel(s)}
          />
        </div>
        {!compact ? <div className="mt-3"><PlanoLegend /></div> : null}
      </div>
      {!compact ? (
        <div className="rounded-xl border border-line bg-[#fbfaf6] p-3 text-xs">
          {unit && occ ? (
            <>
              <p className="text-sm font-extrabold text-navy">{unit.code}</p>
              <p className="mt-0.5 font-semibold text-sea">{STATUS_META[occ.status].label}</p>
              {b ? (
                <dl className="mt-3 space-y-1.5">
                  <div className="flex justify-between gap-2"><dt className="text-mist">Cliente</dt><dd className="text-right font-semibold">{b.customerName}</dd></div>
                  <div className="flex justify-between"><dt className="text-mist">Fechas</dt><dd className="font-semibold">01/01 al 15/01</dd></div>
                  <div className="flex justify-between"><dt className="text-mist">Total</dt><dd className="font-semibold tabular-nums">{formatMoney(b.totalCents)}</dd></div>
                  <div className="flex justify-between"><dt className="text-mist">Saldo</dt><dd className={cn("font-semibold tabular-nums", b.balanceCents ? "text-st-busy" : "text-st-free")}>{formatMoney(b.balanceCents)}</dd></div>
                </dl>
              ) : (
                <p className="mt-3 text-mist">{occ.status === "fuera" ? "Unidad en mantenimiento." : "Sin reservas en el período. Lista para reservar."}</p>
              )}
              <p className="mt-4 border-t border-line pt-2 text-[10px] text-mist">Hacé clic en otra unidad para ver su ficha.</p>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
