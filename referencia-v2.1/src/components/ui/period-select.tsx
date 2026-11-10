"use client";

import * as React from "react";
import { groupPeriods, matchPeriod, seasonPeriods } from "@/lib/periods";
import { todayISO } from "@/lib/dates";
import { cn } from "@/lib/utils";

/** Selector de período: temporada, meses completos o quincenas, o "rango específico". */
export function PeriodSelect({ from, to, onChange, today, className, id = "periodo" }: { from: string; to: string; onChange: (from: string, to: string) => void; today?: string; className?: string; id?: string }) {
  const periods = React.useMemo(() => seasonPeriods(today ?? todayISO()), [today]);
  const current = matchPeriod(periods, from, to);
  return (
    <select
      id={id}
      aria-label="Período"
      value={current?.key ?? ""}
      onChange={(e) => {
        const p = periods.find((x) => x.key === e.target.value);
        if (p) onChange(p.from, p.to);
      }}
      className={cn("h-10 w-full rounded-lg border border-line bg-white px-3 text-sm", className)}
    >
      <option value="">Rango de fechas específico</option>
      {groupPeriods(periods).map((g) => (
        <optgroup key={g.group} label={g.group}>
          {g.items.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
        </optgroup>
      ))}
    </select>
  );
}
