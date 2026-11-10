import { cn } from "@/lib/utils";

/** Barras agrupadas simples (sin dependencias). Valores en la misma unidad. */
export function BarGroups({ data, series, format }: { data: { label: string; values: number[] }[]; series: { name: string; className: string }[]; format: (n: number) => string }) {
  const max = Math.max(1, ...data.flatMap((d) => d.values));
  return (
    <div>
      <div className="flex h-48 items-end gap-3" role="img" aria-label={`Gráfico: ${series.map((s) => s.name).join(" y ")}`}>
        {data.map((d) => (
          <div key={d.label} className="flex h-full flex-1 flex-col justify-end">
            <div className="flex h-full items-end justify-center gap-1">
              {d.values.map((v, i) => (
                <div key={i} title={`${series[i].name}: ${format(v)}`} className={cn("w-full max-w-7 rounded-t", series[i].className)} style={{ height: `${Math.max((v / max) * 100, v ? 2 : 0)}%` }} />
              ))}
            </div>
            <p className="mt-1.5 truncate text-center text-[11px] font-semibold capitalize text-mist">{d.label}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-4 text-xs">
        {series.map((s) => <span key={s.name} className="flex items-center gap-1.5"><span className={cn("size-3 rounded", s.className)} /> {s.name}</span>)}
      </div>
      <table className="sr-only">
        <thead><tr><th>Período</th>{series.map((s) => <th key={s.name}>{s.name}</th>)}</tr></thead>
        <tbody>{data.map((d) => <tr key={d.label}><td>{d.label}</td>{d.values.map((v, i) => <td key={i}>{format(v)}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

export function HBar({ items, format }: { items: { label: string; value: number }[]; format: (n: number) => string }) {
  const total = items.reduce((s, i) => s + i.value, 0) || 1;
  return (
    <ul className="space-y-3">
      {items.map((i) => (
        <li key={i.label}>
          <div className="flex justify-between text-sm"><span>{i.label}</span><span className="font-semibold tabular-nums">{format(i.value)} <span className="text-xs text-mist">({Math.round((i.value / total) * 100)}%)</span></span></div>
          <div className="mt-1 h-2 rounded-full bg-sand"><div className="h-2 rounded-full bg-sea" style={{ width: `${(i.value / total) * 100}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}
