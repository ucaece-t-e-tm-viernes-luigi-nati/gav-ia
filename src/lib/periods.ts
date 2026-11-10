/**
 * Períodos predeterminados para reservar: la temporada (15 de noviembre al 30 de abril)
 * y los meses de diciembre a marzo, completos o por quincena.
 */
export type Period = { key: string; label: string; group: string; from: string; to: string };

const MONTHS = [
  { m: 12, name: "Diciembre" },
  { m: 1, name: "Enero" },
  { m: 2, name: "Febrero" },
  { m: 3, name: "Marzo" },
];

const pad = (n: number) => String(n).padStart(2, "0");
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** Año en que empieza la temporada vigente o próxima (de mayo en adelante se ofrece la siguiente). */
export function seasonStartYear(today: string) {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  return m >= 5 ? y : y - 1;
}

export function seasonPeriods(today: string): Period[] {
  const y0 = seasonStartYear(today);
  const out: Period[] = [{ key: "temporada", label: `Temporada completa (15/11/${y0} al 30/04/${y0 + 1})`, group: "Temporada", from: `${y0}-11-15`, to: `${y0 + 1}-04-30` }];
  for (const { m, name } of MONTHS) {
    const y = m === 12 ? y0 : y0 + 1;
    const ym = `${y}-${pad(m)}`;
    const end = lastDay(y, m);
    out.push(
      { key: `${ym}`, label: `${name} completo`, group: name, from: `${ym}-01`, to: `${ym}-${end}` },
      { key: `${ym}-q1`, label: `${name} · 1.ª quincena (1 al 15)`, group: name, from: `${ym}-01`, to: `${ym}-15` },
      { key: `${ym}-q2`, label: `${name} · 2.ª quincena (16 al ${end})`, group: name, from: `${ym}-16`, to: `${ym}-${end}` },
    );
  }
  return out;
}

/** Período predeterminado que coincide exactamente con un rango, si lo hay. */
export function matchPeriod(periods: Period[], from: string, to: string) {
  return periods.find((p) => p.from === from && p.to === to);
}

/** Agrupa para mostrar en un <select> con <optgroup>. */
export function groupPeriods(periods: Period[]) {
  const groups: { group: string; items: Period[] }[] = [];
  for (const p of periods) {
    const g = groups.find((x) => x.group === p.group);
    if (g) g.items.push(p);
    else groups.push({ group: p.group, items: [p] });
  }
  return groups;
}
