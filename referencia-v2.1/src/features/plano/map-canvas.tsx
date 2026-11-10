"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { shortCode, STATUS_META, type PlanElement, type PlanSector, type PlanUnit, type UnitOccupancy, type UnitStatus } from "./types";

export type Selection = { type: "unit" | "sector" | "element"; id: string };

type Props = {
  width: number;
  height: number;
  sectors: PlanSector[];
  elements: PlanElement[];
  units: PlanUnit[];
  occupancy?: Record<string, UnitOccupancy>;
  selected?: Selection | null;
  /** Selección múltiple (editor). */
  selectedIds?: Set<string>;
  highlight?: Set<string>;
  invalid?: Set<string>;
  editable?: boolean;
  /** Tamaño de cada celda en píxeles (zoom). Sin valor, el plano ocupa el ancho disponible. */
  cellPx?: number;
  onSelect?: (sel: Selection | null, opts?: { additive: boolean }) => void;
  /** Arrastre de la selección: desplazamiento acumulado en celdas desde el inicio. */
  onDragStart?: () => void;
  onDragDelta?: (dx: number, dy: number) => void;
  onDragEnd?: (moved: boolean) => void;
  /** Selección por recuadro sobre un área vacía. */
  onMarquee?: (box: { x: number; y: number; w: number; h: number }, opts: { additive: boolean }) => void;
  ariaLabel: string;
  className?: string;
};

export const STATUS_STYLE: Record<UnitStatus, { fill: string; stroke: string; text: string; dash?: string }> = {
  disponible: { fill: "#e5f5ec", stroke: "#2e9e6a", text: "#1f7a50" },
  ocupada: { fill: "#c8423f", stroke: "#9b2f2c", text: "#ffffff" },
  reservada: { fill: "#fdf3dc", stroke: "#d99a22", text: "#8a5f0c", dash: "0.35 0.25" },
  fuera: { fill: "url(#hatch-off)", stroke: "#8a969e", text: "#5a666d" },
};

const KIND_STYLE: Record<string, { fill: string; stroke: string; text: string }> = {
  carpa: { fill: "#dceffa", stroke: "#2878a8", text: "#123b5d" },
  sombrilla: { fill: "#f5f0e7", stroke: "#b8a684", text: "#5c4d33" },
  cochera: { fill: "#eef3f6", stroke: "#6b7a83", text: "#263238" },
};

const ELEMENT_STYLE: Record<string, { fill: string; stroke: string; text: string; dash?: string }> = {
  mar: { fill: "url(#waves)", stroke: "none", text: "#123b5d" },
  pasillo: { fill: "#ebe3d4", stroke: "none", text: "#7a6a4f" },
  acceso: { fill: "#ffffff", stroke: "#123b5d", text: "#123b5d", dash: "0.4 0.25" },
  edificio: { fill: "#d9dee1", stroke: "#8a969e", text: "#263238" },
  etiqueta: { fill: "transparent", stroke: "none", text: "#263238" },
  otro: { fill: "#f1f3f4", stroke: "#b5bec4", text: "#5a666d" },
};

function StatusGlyph({ status, x, y, s, color }: { status: UnitStatus; x: number; y: number; s: number; color: string }) {
  // Indicador no cromático del estado (accesibilidad): ✓, ●, reloj, ✕.
  const sw = s * 0.16;
  if (status === "disponible") return <path d={`M${x - s * 0.35} ${y} l${s * 0.25} ${s * 0.25} l${s * 0.45} -${s * 0.5}`} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />;
  if (status === "ocupada") return <circle cx={x} cy={y} r={s * 0.28} fill={color} />;
  if (status === "reservada")
    return (
      <g fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round">
        <circle cx={x} cy={y} r={s * 0.36} />
        <path d={`M${x} ${y - s * 0.2} V${y} l${s * 0.15} ${s * 0.12}`} />
      </g>
    );
  return <path d={`M${x - s * 0.28} ${y - s * 0.28} l${s * 0.56} ${s * 0.56} M${x + s * 0.28} ${y - s * 0.28} l-${s * 0.56} ${s * 0.56}`} stroke={color} strokeWidth={sw} strokeLinecap="round" />;
}

export function MapCanvas(props: Props) {
  const { width, height, sectors, elements, units, occupancy, selected, selectedIds, highlight, invalid, editable, cellPx, onSelect, onDragStart, onDragDelta, onDragEnd, onMarquee, ariaLabel, className } = props;
  const svgRef = React.useRef<SVGSVGElement>(null);
  const drag = React.useRef<{ startX: number; startY: number; dx: number; dy: number; started: boolean } | null>(null);
  const marqueeStart = React.useRef<{ x: number; y: number; additive: boolean } | null>(null);
  const [marquee, setMarquee] = React.useState<{ x: number; y: number; w: number; h: number } | null>(null);

  const toCell = (e: React.PointerEvent) => {
    const svg = svgRef.current!;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.getScreenCTM()!.inverse());
    return { x: pt.x, y: pt.y };
  };

  const isSel = (_type: Selection["type"], id: string) => selected?.id === id || !!selectedIds?.has(id);

  const startDrag = (e: React.PointerEvent, sel: Selection) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    const additive = e.shiftKey || e.ctrlKey || e.metaKey;
    if (!editable) {
      onSelect?.(sel);
      return;
    }
    // Shift/Ctrl + clic suma o quita de la selección; un clic simple sobre algo no seleccionado lo selecciona solo.
    if (additive || !isSel(sel.type, sel.id)) onSelect?.(sel, { additive });
    if (additive) return;
    const p = toCell(e);
    drag.current = { startX: p.x, startY: p.y, dx: 0, dy: 0, started: false };
    svgRef.current?.setPointerCapture(e.pointerId);
  };

  const onBackgroundDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    if (!editable || !onMarquee) {
      onSelect?.(null);
      return;
    }
    const p = toCell(e);
    marqueeStart.current = { x: p.x, y: p.y, additive: e.shiftKey || e.ctrlKey || e.metaKey };
    setMarquee({ x: p.x, y: p.y, w: 0, h: 0 });
    svgRef.current?.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const m = marqueeStart.current;
    if (m) {
      const p = toCell(e);
      setMarquee({ x: Math.min(m.x, p.x), y: Math.min(m.y, p.y), w: Math.abs(p.x - m.x), h: Math.abs(p.y - m.y) });
      return;
    }
    const d = drag.current;
    if (!d || !onDragDelta) return;
    const p = toCell(e);
    const dx = Math.round(p.x - d.startX);
    const dy = Math.round(p.y - d.startY);
    if (dx === d.dx && dy === d.dy) return;
    if (!d.started) {
      d.started = true;
      onDragStart?.();
    }
    d.dx = dx;
    d.dy = dy;
    onDragDelta(dx, dy);
  };

  const endPointer = (e: React.PointerEvent) => {
    if (svgRef.current?.hasPointerCapture(e.pointerId)) svgRef.current.releasePointerCapture(e.pointerId);
    const m = marqueeStart.current;
    if (m) {
      marqueeStart.current = null;
      const box = marquee;
      setMarquee(null);
      if (box && (box.w > 0.4 || box.h > 0.4)) onMarquee?.(box, { additive: m.additive });
      else if (!m.additive) onSelect?.(null);
      return;
    }
    if (drag.current) {
      onDragEnd?.(drag.current.started);
      drag.current = null;
    }
  };
  const keySelect = (sel: Selection) => (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect?.(sel);
    }
  };

  return (
    <svg
      ref={svgRef}
      viewBox={`-0.5 -0.5 ${width + 1} ${height + 1}`}
      className={cn("block touch-none select-none", cellPx ? "max-w-none" : "h-auto w-full", className)}
      style={cellPx ? { width: (width + 1) * cellPx, height: (height + 1) * cellPx } : { minWidth: Math.max(640, width * 16) }}
      role="group"
      aria-label={ariaLabel}
      onPointerMove={onPointerMove}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
      onPointerDown={onBackgroundDown}
    >
      <defs>
        <pattern id="hatch-off" width="0.6" height="0.6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="0.6" height="0.6" fill="#eef0f2" />
          <line x1="0" y1="0" x2="0" y2="0.6" stroke="#b5bec4" strokeWidth="0.18" />
        </pattern>
        <pattern id="waves" width="3" height="1.2" patternUnits="userSpaceOnUse">
          <rect width="3" height="1.2" fill="#d4eaf7" />
          <path d="M0 0.8 Q0.75 0.4 1.5 0.8 T3 0.8" fill="none" stroke="#2878a8" strokeOpacity="0.35" strokeWidth="0.08" />
        </pattern>
        <pattern id="grid" width="1" height="1" patternUnits="userSpaceOnUse">
          <path d="M1 0H0V1" fill="none" stroke="#123b5d" strokeOpacity="0.07" strokeWidth="0.04" />
        </pattern>
      </defs>

      <rect x={0} y={0} width={width} height={height} rx={0.4} fill="#fbfaf6" stroke="#e4e8eb" strokeWidth={0.06} />
      {editable ? <rect x={0} y={0} width={width} height={height} fill="url(#grid)" pointerEvents="none" /> : null}

      {sectors.map((s) => {
        const sel = isSel("sector", s.id);
        return (
          <g key={s.id}>
            {/* El interior del sector actúa como fondo: permite seleccionar por recuadro. */}
            <rect x={s.x} y={s.y} width={s.w} height={s.h} rx={0.5} fill="#dceffa" fillOpacity={0.28} stroke="#2878a8" strokeOpacity={sel ? 1 : 0.35} strokeWidth={sel ? 0.12 : 0.06} strokeDasharray="0.5 0.3" />
            {/* El sector se selecciona y se arrastra desde su etiqueta. */}
            <g
              onPointerDown={(e) => editable && startDrag(e, { type: "sector", id: s.id })}
              className={editable ? "cursor-move" : undefined}
              role={editable ? "button" : undefined}
              tabIndex={editable ? 0 : undefined}
              aria-label={editable ? `Sector ${s.name}` : undefined}
              onKeyDown={editable ? keySelect({ type: "sector", id: s.id }) : undefined}
            >
              {editable ? <rect x={s.x + 0.15} y={s.y + 0.1} width={Math.min(s.w - 0.3, s.name.length * 0.42 + 0.6)} height={0.9} rx={0.2} fill={sel ? "#2878a8" : "#ffffff"} fillOpacity={sel ? 1 : 0.85} stroke="#2878a8" strokeOpacity={0.5} strokeWidth={0.04} /> : null}
              <text x={s.x + 0.4} y={s.y + 0.75} fontSize={0.62} fontWeight={700} fill={editable && sel ? "#ffffff" : "#2878a8"} letterSpacing={0.03}>
                {s.name.toUpperCase()}
              </text>
            </g>
          </g>
        );
      })}

      {elements.map((el) => {
        const st = ELEMENT_STYLE[el.kind] ?? ELEMENT_STYLE.otro;
        const sel = isSel("element", el.id);
        return (
          <g
            key={el.id}
            onPointerDown={(e) => editable && startDrag(e, { type: "element", id: el.id })}
            className={editable ? "cursor-move" : undefined}
            role={editable ? "button" : undefined}
            tabIndex={editable ? 0 : undefined}
            aria-label={editable ? `${el.kind} ${el.label}` : undefined}
            onKeyDown={editable ? keySelect({ type: "element", id: el.id }) : undefined}
          >
            <rect x={el.x} y={el.y} width={el.w} height={el.h} rx={0.3} fill={st.fill} stroke={sel ? "#2878a8" : st.stroke} strokeWidth={sel ? 0.14 : 0.06} strokeDasharray={st.dash} />
            {el.label ? (
              <text
                x={el.x + el.w / 2}
                y={el.y + el.h / 2}
                fontSize={Math.min(0.8, el.h * 0.55, (el.w / Math.max(el.label.length, 1)) * 1.6)}
                textAnchor="middle"
                dominantBaseline="central"
                fill={st.text}
                fontWeight={600}
                transform={el.h > el.w * 1.6 ? `rotate(-90 ${el.x + el.w / 2} ${el.y + el.h / 2})` : undefined}
              >
                {el.label}
              </text>
            ) : null}
          </g>
        );
      })}

      {units.map((u) => {
        const occ = occupancy?.[u.id];
        const st = occ ? STATUS_STYLE[occ.status] : (KIND_STYLE[u.kind] ?? KIND_STYLE.carpa);
        const dash = occ ? STATUS_STYLE[occ.status].dash : undefined;
        const sel = isSel("unit", u.id);
        const bad = invalid?.has(u.id);
        const hl = highlight?.has(u.id);
        const s = Math.min(u.w, u.h);
        const label = `${u.code}${occ ? `, ${STATUS_META[occ.status].label}` : ""}${occ?.pendingPayment ? ", con saldo pendiente" : ""}`;
        const cx = u.x + u.w / 2;
        const cy = u.y + u.h / 2;
        return (
          <g
            key={u.id}
            role="button"
            tabIndex={0}
            aria-label={label}
            aria-pressed={sel}
            onPointerDown={(e) => startDrag(e, { type: "unit", id: u.id })}
            onKeyDown={keySelect({ type: "unit", id: u.id })}
            className={cn("outline-none", editable ? "cursor-move" : "cursor-pointer")}
          >
            <title>{label}</title>
            {sel || hl ? <rect x={u.x - 0.22} y={u.y - 0.22} width={u.w + 0.44} height={u.h + 0.44} rx={0.55} fill="none" stroke={hl && !sel ? "#d99a22" : "#123b5d"} strokeWidth={0.14} /> : null}
            {u.kind === "sombrilla" ? (
              <circle cx={cx} cy={cy} r={s / 2 - 0.08} fill={st.fill} stroke={bad ? "#c8423f" : st.stroke} strokeWidth={0.1} strokeDasharray={dash} />
            ) : (
              <rect x={u.x + 0.06} y={u.y + 0.06} width={u.w - 0.12} height={u.h - 0.12} rx={u.kind === "cochera" ? 0.15 : 0.35} fill={st.fill} stroke={bad ? "#c8423f" : st.stroke} strokeWidth={0.1} strokeDasharray={dash} />
            )}
            {u.kind === "carpa" ? <path d={`M${u.x + 0.35} ${u.y + 0.7} L${cx} ${u.y + 0.3} L${u.x + u.w - 0.35} ${u.y + 0.7}`} fill="none" stroke={st.stroke} strokeWidth={0.07} strokeLinejoin="round" opacity={0.8} /> : null}
            <text x={cx} y={occ ? cy + s * 0.08 : cy} fontSize={s * 0.36} fontWeight={800} textAnchor="middle" dominantBaseline="central" fill={st.text} className="tabular-nums">
              {shortCode(u.code)}
            </text>
            {occ ? <StatusGlyph status={occ.status} x={cx} y={u.y + u.h - s * 0.2} s={s * 0.3} color={st.text} /> : null}
            {u.outOfService && !occ ? <StatusGlyph status="fuera" x={u.x + u.w - 0.45} y={u.y + 0.45} s={0.7} color="#5a666d" /> : null}
            {occ?.pendingPayment ? (
              <g>
                <circle cx={u.x + u.w - 0.25} cy={u.y + 0.25} r={0.42} fill="#123b5d" stroke="#fff" strokeWidth={0.08} />
                <text x={u.x + u.w - 0.25} y={u.y + 0.27} fontSize={0.5} fontWeight={800} textAnchor="middle" dominantBaseline="central" fill="#fff">$</text>
              </g>
            ) : null}
          </g>
        );
      })}
      {marquee ? (
        <rect x={marquee.x} y={marquee.y} width={marquee.w} height={marquee.h} fill="#2878a8" fillOpacity={0.08} stroke="#2878a8" strokeWidth={0.06} strokeDasharray="0.3 0.2" pointerEvents="none" />
      ) : null}
    </svg>
  );
}

export function PlanoLegend({ showPayment = true }: { showPayment?: boolean }) {
  const items: UnitStatus[] = ["disponible", "reservada", "ocupada", "fuera"];
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-ink" aria-label="Referencias del plano">
      {items.map((s) => {
        const st = STATUS_STYLE[s];
        return (
          <li key={s} className="flex items-center gap-1.5">
            <svg viewBox="0 0 2 2" className="size-5" aria-hidden>
              <defs>
                <pattern id={`lg-${s}`} width="0.6" height="0.6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <rect width="0.6" height="0.6" fill="#eef0f2" />
                  <line x1="0" y1="0" x2="0" y2="0.6" stroke="#b5bec4" strokeWidth="0.18" />
                </pattern>
              </defs>
              <rect x="0.1" y="0.1" width="1.8" height="1.8" rx="0.35" fill={s === "fuera" ? `url(#lg-${s})` : st.fill} stroke={st.stroke} strokeWidth="0.12" strokeDasharray={st.dash} />
              <StatusGlyph status={s} x={1} y={1} s={1.1} color={st.text} />
            </svg>
            <span className="font-medium">{STATUS_META[s].label}</span>
          </li>
        );
      })}
      {showPayment ? (
        <li className="flex items-center gap-1.5">
          <span className="grid size-4 place-items-center rounded-full bg-navy text-[9px] font-extrabold text-white" aria-hidden>$</span>
          <span className="font-medium">Saldo pendiente</span>
        </li>
      ) : null}
    </ul>
  );
}
