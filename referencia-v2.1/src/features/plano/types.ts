export type MapName = "playa" | "cocheras";
export const MAPS: { id: MapName; label: string; description: string }[] = [
  { id: "playa", label: "Playa", description: "Carpas y sombrillas" },
  { id: "cocheras", label: "Cocheras", description: "Espacios de estacionamiento" },
];

export type UnitKind = { code: string; label: string; map: MapName; defaultW: number; defaultH: number };

export type PlanUnit = {
  id: string;
  kind: string;
  code: string;
  rowLabel: string;
  sectorId: string | null;
  x: number;
  y: number;
  w: number;
  h: number;
  outOfService: boolean;
  outOfServiceReason: string;
};

export type PlanSector = { id: string; name: string; x: number; y: number; w: number; h: number };

export type ElementKind = "pasillo" | "mar" | "edificio" | "etiqueta" | "acceso" | "otro";
export const ELEMENT_KINDS: { code: ElementKind; label: string; w: number; h: number }[] = [
  { code: "pasillo", label: "Pasillo", w: 12, h: 2 },
  { code: "mar", label: "Mar", w: 20, h: 3 },
  { code: "acceso", label: "Acceso", w: 4, h: 2 },
  { code: "edificio", label: "Edificio", w: 4, h: 3 },
  { code: "etiqueta", label: "Etiqueta", w: 6, h: 1 },
  { code: "otro", label: "Otro", w: 3, h: 3 },
];
export type PlanElement = { id: string; kind: ElementKind; label: string; x: number; y: number; w: number; h: number };

export type SiteMap = {
  map: MapName;
  width: number;
  height: number;
  version: number;
  sectors: PlanSector[];
  elements: PlanElement[];
  units: PlanUnit[];
};

export type UnitStatus = "disponible" | "ocupada" | "reservada" | "fuera";

export const STATUS_META: Record<UnitStatus, { label: string; short: string; description: string }> = {
  disponible: { label: "Disponible", short: "Libre", description: "Sin reservas en el período" },
  ocupada: { label: "Ocupada", short: "Ocupada", description: "Reserva confirmada en el período" },
  reservada: { label: "Reservada", short: "Pendiente", description: "Reserva pendiente de confirmación" },
  fuera: { label: "Fuera de servicio", short: "Fuera", description: "No disponible para reservar" },
};

export type UnitBooking = {
  reservationId: string;
  number: number;
  startDate: string;
  endDate: string;
  status: "pendiente" | "confirmada" | "finalizada";
  customerId: string;
  customerName: string;
  customerPhone: string;
  totalCents: number;
  paidCents: number;
  balanceCents: number;
};

export type UnitOccupancy = { status: UnitStatus; bookings: UnitBooking[]; pendingPayment: boolean };

/** Calcula el estado de una unidad para el período a partir de sus reservas superpuestas. */
export function computeStatus(unit: Pick<PlanUnit, "outOfService">, bookings: UnitBooking[]): UnitOccupancy {
  const pendingPayment = bookings.some((b) => b.balanceCents > 0);
  if (unit.outOfService) return { status: "fuera", bookings, pendingPayment };
  if (bookings.some((b) => b.status === "confirmada" || b.status === "finalizada")) return { status: "ocupada", bookings, pendingPayment };
  if (bookings.length) return { status: "reservada", bookings, pendingPayment };
  return { status: "disponible", bookings, pendingPayment };
}

/** Número corto para mostrar dentro de la unidad ("Carpa 07" -> "07"). */
export function shortCode(code: string) {
  const m = code.match(/(\d+[a-zA-Z]?)\s*$/);
  return m ? m[1] : code.slice(0, 4);
}
