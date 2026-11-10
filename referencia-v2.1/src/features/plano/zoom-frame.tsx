"use client";

import * as React from "react";
import { Maximize2, Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

const MIN_PX = 4;
const MAX_PX = 60;
const BASE_PX = 16; // 100 %

/**
 * Marco con zoom para el plano: botones −/+, "Ajustar" al ancho disponible y
 * Ctrl + rueda del mouse. Entrega al hijo el tamaño de celda en píxeles.
 */
export function ZoomFrame({
  width,
  height,
  children,
  toolbar,
  className,
}: {
  width: number;
  height: number;
  children: (cellPx: number) => React.ReactNode;
  toolbar?: React.ReactNode;
  className?: string;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [available, setAvailable] = React.useState(0);
  const [zoom, setZoom] = React.useState<number | null>(null); // null = ajustar al ancho

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setAvailable(el.clientWidth));
    ro.observe(el);
    setAvailable(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const fitPx = available ? Math.max(MIN_PX, Math.min(MAX_PX, (available - 4) / (width + 1))) : BASE_PX;
  const cellPx = zoom ?? fitPx;
  const step = (dir: 1 | -1) => setZoom(Math.max(MIN_PX, Math.min(MAX_PX, Math.round(cellPx * (dir > 0 ? 1.25 : 0.8) * 10) / 10)));

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setZoom((z) => {
        const current = z ?? fitPx;
        return Math.max(MIN_PX, Math.min(MAX_PX, Math.round(current * (e.deltaY < 0 ? 1.1 : 0.9) * 10) / 10));
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [fitPx]);

  const btn = "grid size-8 place-items-center rounded-md text-ink hover:bg-sand disabled:opacity-40";
  return (
    <div className={cn("flex flex-col", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2">
        <div className="flex items-center gap-1" role="group" aria-label="Zoom del plano">
          <button type="button" className={btn} onClick={() => step(-1)} disabled={cellPx <= MIN_PX} aria-label="Alejar"><Minus className="size-4" /></button>
          <span className="w-14 text-center text-xs font-semibold tabular-nums text-mist">{Math.round((cellPx / BASE_PX) * 100)} %</span>
          <button type="button" className={btn} onClick={() => step(1)} disabled={cellPx >= MAX_PX} aria-label="Acercar"><Plus className="size-4" /></button>
          <button type="button" className={cn(btn, "ml-1 w-auto gap-1.5 px-2 text-xs font-semibold", zoom === null && "bg-foam text-navy")} onClick={() => setZoom(null)} title="Ajustar al ancho">
            <Maximize2 className="size-3.5" /> Ajustar
          </button>
          <span className="ml-2 hidden text-[11px] text-mist sm:inline">Ctrl + rueda para zoom</span>
        </div>
        {toolbar}
      </div>
      <div ref={ref} className="max-h-[75vh] overflow-auto bg-[#f7f6f1] p-1" style={{ minHeight: Math.min(480, (height + 1) * cellPx + 8) }}>
        {children(cellPx)}
      </div>
    </div>
  );
}
