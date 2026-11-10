import type { Db } from "./types";

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

const ROW_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/**
 * Plano inicial para un balneario recién aprobado, armado con las cantidades que cargó en el alta
 * (paso 3 del wizard): filas de 15 sombrillas cerca del mar, pasillo, filas de 15 carpas e ingreso.
 * Cocheras en filas de 15. El dueño lo ajusta después en el editor. Se limita a 300 por tipo
 * (el resto se agrega desde el editor).
 */
export function starterLayout(carpas: number, sombrillas: number, cocheras: number): Layout {
  const PER_ROW = 15;
  const STEP = 3;
  const c = Math.max(0, Math.min(carpas, 300));
  const s = Math.max(0, Math.min(sombrillas, 300));
  const k = Math.max(0, Math.min(cocheras, 100));
  const width = 4 + PER_ROW * STEP + 1;
  const rowsOf = (n: number) => Array.from({ length: Math.ceil(n / PER_ROW) }, (_, i) => Math.min(PER_ROW, n - i * PER_ROW));

  const sectors: Layout["sectors"] = [];
  const elements: Layout["elements"] = [{ map: "playa", kind: "mar", label: "Mar", x: 0, y: 0, w: width, h: 2 }];
  let y = 3;
  let letter = 0;
  if (s) {
    const rows = rowsOf(s);
    sectors.push({
      map: "playa", name: "Sombrillas", x: 1, y, w: width - 2, h: rows.length * STEP + 1,
      rows: rows.map((count, i) => ({ kind: "sombrilla" as const, count, x: 3, y: y + 1 + i * STEP, step: STEP, label: ROW_LETTERS[letter++ % 26] })),
    });
    y += rows.length * STEP + 2;
    elements.push({ map: "playa", kind: "pasillo", label: "Pasillo", x: 0, y, w: width, h: 1 });
    y += 2;
  }
  if (c) {
    const rows = rowsOf(c);
    sectors.push({
      map: "playa", name: "Carpas", x: 1, y, w: width - 2, h: rows.length * STEP + 1,
      rows: rows.map((count, i) => ({ kind: "carpa" as const, count, x: 3, y: y + 1 + i * STEP, step: STEP, label: ROW_LETTERS[letter++ % 26] })),
    });
    y += rows.length * STEP + 2;
  }
  elements.push({ map: "playa", kind: "acceso", label: "Ingreso", x: 0, y, w: width, h: 2 });
  const height = Math.max(12, y + 3);

  const cocheraRows = rowsOf(k);
  const cocherasHeight = Math.max(10, cocheraRows.length * 5 + 4);
  if (k) {
    sectors.push({
      map: "cocheras", name: "Cocheras", x: 1, y: 0, w: width - 2, h: cocheraRows.length * 5 + 1,
      rows: cocheraRows.map((count, i) => ({ kind: "cochera" as const, count, x: 3, y: 1 + i * 5, step: STEP, label: String(i + 1) })),
    });
  }
  elements.push({ map: "cocheras", kind: "acceso", label: "Entrada", x: 0, y: cocherasHeight - 2, w: width, h: 1 });

  return {
    maps: [{ map: "playa", width, height }, { map: "cocheras", width, height: cocherasHeight }],
    sectors,
    elements,
  };
}
