import type { Db } from "./types.ts";

/**
 * Plantillas de planos. Se usan para los datos de demostración y como plano
 * predeterminado de cada balneario nuevo (luego el dueño lo edita libremente).
 */

export type Kind = "carpa" | "sombrilla" | "cochera";
export type MapName = "playa" | "cocheras";

export type LayoutRow = {
  kind: Kind;
  count: number;
  x: number;
  y: number;
  /** Distancia entre unidades consecutivas (en celdas). */
  step: number;
  /** "h": de izquierda a derecha · "v": de arriba hacia abajo. */
  dir?: "h" | "v";
  w?: number;
  h?: number;
  label?: string;
  /** Numeración explícita (si falta, se numera consecutivamente por tipo). */
  start?: number;
  desc?: boolean;
};

export type Layout = {
  maps: { map: MapName; width: number; height: number }[];
  sectors: { map: MapName; name: string; x: number; y: number; w: number; h: number; rows: LayoutRow[] }[];
  elements: { map: MapName; kind: string; label: string; x: number; y: number; w: number; h: number }[];
};

const SIZE: Record<Kind, [number, number]> = { carpa: [2, 2], sombrilla: [2, 2], cochera: [2, 4] };
const MAP_OF: Record<Kind, MapName> = { carpa: "playa", sombrilla: "playa", cochera: "cocheras" };
const KIND_LABEL: Record<Kind, string> = { carpa: "Carpa", sombrilla: "Sombrilla", cochera: "Cochera" };
const pad = (n: number) => String(n).padStart(2, "0");

/** Inserta el plano (requiere permiso de edición del plano o privilegios de servicio). */
export async function createLayout(db: Db, balnearioId: string, layout: Layout) {
  const units: Record<string, string> = {};
  const counters: Record<Kind, number> = { carpa: 0, sombrilla: 0, cochera: 0 };
  for (const m of layout.maps) {
    await db.exec(`insert into site_maps (balneario_id, map, width, height) values ($1, $2, $3, $4)`, [balnearioId, m.map, m.width, m.height]);
  }
  for (const e of layout.elements) {
    await db.exec(`insert into map_elements (balneario_id, map, kind, label, x, y, w, h) values ($1, $2, $3, $4, $5, $6, $7, $8)`, [
      balnearioId, e.map, e.kind, e.label, e.x, e.y, e.w, e.h,
    ]);
  }
  for (const [i, s] of layout.sectors.entries()) {
    const sector = await db.one<{ id: string }>(
      `insert into sectors (balneario_id, map, name, x, y, w, h, sort_order) values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
      [balnearioId, s.map, s.name, s.x, s.y, s.w, s.h, i],
    );
    for (const row of s.rows) {
      const [dw, dh] = SIZE[row.kind];
      const w = row.w ?? dw;
      const h = row.h ?? dh;
      for (let p = 0; p < row.count; p++) {
        const n = row.start !== undefined ? row.start + (row.desc ? -p : p) : ++counters[row.kind];
        const code = `${KIND_LABEL[row.kind]} ${pad(n)}`;
        const vertical = row.dir === "v";
        const u = await db.one<{ id: string }>(
          `insert into units (balneario_id, sector_id, kind, map, code, row_label, x, y, w, h)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning id`,
          [balnearioId, sector!.id, row.kind, MAP_OF[row.kind], code, row.label ?? "", vertical ? row.x : row.x + p * row.step, vertical ? row.y + p * row.step : row.y, w, h],
        );
        units[code] = u!.id;
      }
    }
  }
  return units;
}

/**
 * Plano predeterminado para balnearios nuevos, inspirado en una planilla real:
 * mar y dos filas de sombrillas grandes al frente, una franja de carpas
 * verticales, cinco columnas de carpas horizontales separadas por pasillos y
 * una franja inferior de carpas. Cocheras en dos filas con calle interna.
 */
export const DEFAULT_LAYOUT: Layout = {
  maps: [{ map: "playa", width: 94, height: 62 }, { map: "cocheras", width: 34, height: 15 }],
  elements: [
    { map: "playa", kind: "mar", label: "Mar", x: 0, y: 0, w: 92, h: 2 },
    { map: "playa", kind: "pasillo", label: "Pasillo", x: 0, y: 14, w: 92, h: 1 },
    { map: "playa", kind: "pasillo", label: "Pasillo", x: 0, y: 22, w: 92, h: 1 },
    { map: "playa", kind: "pasillo", label: "Pasillo", x: 24, y: 24, w: 2, h: 26 },
    { map: "playa", kind: "pasillo", label: "Pasillo", x: 58, y: 24, w: 2, h: 26 },
    { map: "playa", kind: "acceso", label: "Ingreso", x: 0, y: 58, w: 92, h: 2 },
    { map: "cocheras", kind: "pasillo", label: "Calle interna", x: 0, y: 6, w: 34, h: 2 },
    { map: "cocheras", kind: "acceso", label: "Entrada", x: 0, y: 13, w: 34, h: 1 },
  ],
  sectors: [
    {
      map: "playa", name: "Sombrillas", x: 1, y: 3, w: 90, h: 10,
      rows: [
        { kind: "sombrilla", count: 10, x: 4, y: 4, step: 9, w: 3, h: 3, start: 19, desc: true, label: "1" },
        { kind: "sombrilla", count: 9, x: 8, y: 9, step: 9, w: 3, h: 3, start: 9, desc: true, label: "2" },
      ],
    },
    {
      map: "playa", name: "Carpas · línea superior", x: 1, y: 16, w: 90, h: 6,
      rows: [
        { kind: "carpa", count: 7, x: 8, y: 17, step: 3, w: 2, h: 4, start: 98, desc: true, label: "S" },
        { kind: "carpa", count: 5, x: 40, y: 17, step: 3, w: 2, h: 4, start: 58, desc: true, label: "S" },
        { kind: "carpa", count: 5, x: 72, y: 17, step: 3, w: 2, h: 4, start: 16, desc: true, label: "S" },
      ],
    },
    {
      map: "playa", name: "Carpas", x: 1, y: 23, w: 90, h: 28,
      rows: [
        { kind: "carpa", count: 13, x: 8, y: 24, step: 2, dir: "v", w: 4, h: 2, start: 99, label: "A" },
        { kind: "carpa", count: 13, x: 12, y: 24, step: 2, dir: "v", w: 4, h: 2, start: 53, desc: true, label: "B" },
        { kind: "carpa", count: 13, x: 38, y: 24, step: 2, dir: "v", w: 4, h: 2, start: 59, label: "C" },
        { kind: "carpa", count: 13, x: 42, y: 24, step: 2, dir: "v", w: 4, h: 2, start: 40, desc: true, label: "D" },
        { kind: "carpa", count: 11, x: 72, y: 24, step: 2, dir: "v", w: 4, h: 2, start: 27, desc: true, label: "E" },
      ],
    },
    {
      map: "playa", name: "Carpas · línea inferior", x: 1, y: 52, w: 90, h: 5,
      rows: [
        { kind: "carpa", count: 5, x: 28, y: 52, step: 3, w: 2, h: 4, start: 79, desc: true, label: "I" },
        { kind: "carpa", count: 7, x: 62, y: 52, step: 3, w: 2, h: 4, start: 11, desc: true, label: "I" },
      ],
    },
    {
      map: "cocheras", name: "Cocheras", x: 1, y: 0, w: 32, h: 13,
      rows: [
        { kind: "cochera", count: 10, x: 2, y: 1, step: 3, start: 1, label: "1" },
        { kind: "cochera", count: 10, x: 2, y: 9, step: 3, start: 11, label: "2" },
      ],
    },
  ],
};
