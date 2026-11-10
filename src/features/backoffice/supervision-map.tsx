"use client";

import * as React from "react";
import { MapCanvas, PlanoLegend, type Selection } from "@/features/plano/map-canvas";
import { ZoomFrame } from "@/features/plano/zoom-frame";
import { STATUS_META, type SiteMap, type UnitOccupancy } from "@/features/plano/types";
import { Badge } from "@/components/ui/primitives";
import { formatDate } from "@/lib/dates";

/** Plano en modo supervisión: solo estados, fechas y cliente. Sin importes ni acciones. */
export function SupervisionMap({ map, occupancy }: { map: SiteMap; occupancy: Record<string, UnitOccupancy> }) {
  const [sel, setSel] = React.useState<Selection | null>(null);
  const unit = sel ? map.units.find((u) => u.id === sel.id) : undefined;
  const occ = unit ? occupancy[unit.id] : undefined;
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_280px]">
      <div className="overflow-hidden rounded-xl border border-line bg-white">
        <div className="border-b border-line px-4 py-3"><PlanoLegend showPayment={false} /></div>
        <ZoomFrame width={map.width} height={map.height}>
          {(cellPx) => (
            <MapCanvas
              cellPx={cellPx}
              ariaLabel={`Plano de ${map.map} (supervisión)`}
              width={map.width}
              height={map.height}
              sectors={map.sectors}
              elements={map.elements}
              units={map.units}
              occupancy={occupancy}
              selected={sel}
              onSelect={(s) => setSel(s?.type === "unit" ? s : null)}
            />
          )}
        </ZoomFrame>
      </div>
      <div className="h-fit rounded-xl border border-line bg-white p-4 text-sm">
        {unit && occ ? (
          <>
            <p className="font-bold text-navy">{unit.code}</p>
            <Badge tone={occ.status === "disponible" ? "success" : occ.status === "ocupada" ? "danger" : occ.status === "reservada" ? "warning" : "muted"}>{STATUS_META[occ.status].label}</Badge>
            <ul className="mt-3 space-y-2">
              {occ.bookings.map((b) => (
                <li key={b.reservationId} className="rounded-lg bg-sand/50 p-2">
                  <p className="font-semibold">#{b.number} · {b.customerName}</p>
                  <p className="text-xs text-mist">{formatDate(b.startDate)} al {formatDate(b.endDate)} · {b.status}</p>
                </li>
              ))}
              {!occ.bookings.length ? <li className="text-mist">Sin reservas en el período.</li> : null}
            </ul>
          </>
        ) : (
          <p className="text-mist">Seleccioná una unidad para ver su ocupación. Los importes no se muestran en la supervisión.</p>
        )}
      </div>
    </div>
  );
}
