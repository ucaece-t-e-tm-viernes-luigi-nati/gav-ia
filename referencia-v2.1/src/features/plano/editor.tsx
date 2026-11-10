"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Building, Car, Copy, DoorOpen, Eraser, Footprints, LayoutGrid, MousePointer2, Rows3, Save, Shapes, Tag, Tent, Trash2, Umbrella, Undo2, Waves,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { Alert, Badge, Card } from "@/components/ui/primitives";
import { ConfirmButton, Dialog, DialogContent } from "@/components/ui/overlay";
import { cn } from "@/lib/utils";
import { saveMapAction } from "@/server/actions/plano";
import { MapCanvas, type Selection } from "./map-canvas";
import { ZoomFrame } from "./zoom-frame";
import { ELEMENT_KINDS, MAPS, type ElementKind, type PlanElement, type PlanSector, type PlanUnit, type SiteMap, type UnitKind } from "./types";

type Draft = Omit<SiteMap, "map">;
type Box = { x: number; y: number; w: number; h: number };

const KIND_ICON: Record<string, LucideIcon> = { carpa: Tent, sombrilla: Umbrella, cochera: Car };
const ELEMENT_ICON: Record<ElementKind, LucideIcon> = { pasillo: Footprints, mar: Waves, acceso: DoorOpen, edificio: Building, etiqueta: Tag, otro: Shapes };
const MAX_SIZE = 200;
const MARGIN = 2;

let tmpSeq = 0;
const tmpId = () => `tmp-${Date.now().toString(36)}-${(tmpSeq++).toString(36)}`;
const pad = (n: number) => String(n).padStart(2, "0");
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

function overlaps(a: Box, b: Box) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** Agranda el lienzo para que todo entre, con un margen. Nunca lo achica mientras se edita. */
function grow(d: Draft): Draft {
  const items: Box[] = [...d.units, ...d.elements, ...d.sectors];
  const right = Math.max(0, ...items.map((i) => i.x + i.w));
  const bottom = Math.max(0, ...items.map((i) => i.y + i.h));
  return { ...d, width: clamp(Math.max(d.width, right + MARGIN), 10, MAX_SIZE), height: clamp(Math.max(d.height, bottom + MARGIN), 10, MAX_SIZE) };
}

/** Al guardar, el lienzo se ajusta al contenido (más un margen). */
function cropToContent(d: Draft): Draft {
  const items: Box[] = [...d.units, ...d.elements, ...d.sectors];
  if (!items.length) return { ...d, width: 40, height: 24 };
  const right = Math.max(...items.map((i) => i.x + i.w));
  const bottom = Math.max(...items.map((i) => i.y + i.h));
  return { ...d, width: clamp(right + MARGIN, 20, MAX_SIZE), height: clamp(bottom + MARGIN, 12, MAX_SIZE) };
}

function findFreeSpot(d: Draft, w: number, h: number) {
  for (let y = 0; y + h <= d.height; y++) {
    for (let x = 0; x + w <= d.width; x++) {
      const box = { x, y, w, h };
      if (!d.units.some((u) => overlaps(u, box)) && !d.elements.some((e) => e.kind !== "etiqueta" && overlaps(e, box))) return { x, y };
    }
  }
  // Sin lugar: debajo de todo (el lienzo crece).
  const bottom = Math.max(0, ...[...d.units, ...d.elements, ...d.sectors].map((i) => i.y + i.h));
  return { x: 0, y: bottom + 1 };
}

function nextNumber(units: PlanUnit[], kind: string) {
  let max = 0;
  for (const u of units) {
    if (u.kind !== kind) continue;
    const m = u.code.match(/(\d+)\s*$/);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max + 1;
}

function sectorAt(sectors: PlanSector[], u: Box) {
  const cx = u.x + u.w / 2;
  const cy = u.y + u.h / 2;
  return sectors.find((s) => cx >= s.x && cx <= s.x + s.w && cy >= s.y && cy <= s.y + s.h)?.id ?? null;
}

/** Elementos que se mueven al arrastrar la selección (un sector arrastra sus unidades). */
function movingSets(d: Draft, selection: Selection[]) {
  const units = new Set(selection.filter((s) => s.type === "unit").map((s) => s.id));
  const elements = new Set(selection.filter((s) => s.type === "element").map((s) => s.id));
  const sectors = new Set(selection.filter((s) => s.type === "sector").map((s) => s.id));
  for (const u of d.units) if (u.sectorId && sectors.has(u.sectorId)) units.add(u.id);
  return { units, elements, sectors };
}

function moveBy(base: Draft, sets: ReturnType<typeof movingSets>, dx: number, dy: number): Draft {
  const moving: Box[] = [
    ...base.units.filter((u) => sets.units.has(u.id)),
    ...base.elements.filter((e) => sets.elements.has(e.id)),
    ...base.sectors.filter((s) => sets.sectors.has(s.id)),
  ];
  if (!moving.length) return base;
  const minX = Math.min(...moving.map((i) => i.x));
  const minY = Math.min(...moving.map((i) => i.y));
  const maxR = Math.max(...moving.map((i) => i.x + i.w));
  const maxB = Math.max(...moving.map((i) => i.y + i.h));
  const ddx = clamp(dx, -minX, MAX_SIZE - maxR);
  const ddy = clamp(dy, -minY, MAX_SIZE - maxB);
  return grow({
    ...base,
    units: base.units.map((u) => (sets.units.has(u.id) ? { ...u, x: u.x + ddx, y: u.y + ddy } : u)),
    elements: base.elements.map((e) => (sets.elements.has(e.id) ? { ...e, x: e.x + ddx, y: e.y + ddy } : e)),
    sectors: base.sectors.map((s) => (sets.sectors.has(s.id) ? { ...s, x: s.x + ddx, y: s.y + ddy } : s)),
  });
}

export function PlanoEditor({ map, kinds, reservedCodes, basePath }: { map: SiteMap; kinds: UnitKind[]; reservedCodes: string[]; basePath: string }) {
  const router = useRouter();
  const mapKinds = kinds.filter((k) => k.map === map.map);
  const [draft, setDraft] = React.useState<Draft>(() => grow({ width: map.width, height: map.height, version: map.version, sectors: map.sectors, elements: map.elements, units: map.units }));
  const [history, setHistory] = React.useState<Draft[]>([]);
  const [selection, setSelection] = React.useState<Selection[]>([]);
  const [dirty, setDirty] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [feedback, setFeedback] = React.useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [rowDialog, setRowDialog] = React.useState(false);
  const dragBase = React.useRef<{ draft: Draft; sets: ReturnType<typeof movingSets> } | null>(null);

  const draftRef = React.useRef(draft);
  draftRef.current = draft;
  const selectedIds = React.useMemo(() => new Set(selection.map((s) => s.id)), [selection]);

  const pushHistory = React.useCallback(() => {
    const snapshot = draftRef.current;
    setHistory((h) => [...h.slice(-49), snapshot]);
  }, []);

  const commit = React.useCallback((fn: (d: Draft) => Draft, record = true) => {
    if (record) pushHistory();
    setDraft((d) => grow(fn(d)));
    setDirty(true);
    setFeedback(null);
  }, [pushHistory]);

  const undo = React.useCallback(() => {
    if (!history.length) return;
    setDraft(history[history.length - 1]);
    setHistory(history.slice(0, -1));
    setSelection([]);
    setDirty(true);
  }, [history]);

  React.useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  // Validación local
  const invalid = React.useMemo(() => {
    const set = new Set<string>();
    const reserved = new Set(reservedCodes.map((c) => c.toLowerCase()));
    const seen = new Map<string, string>();
    for (const u of draft.units) {
      const k = u.code.trim().toLowerCase();
      if (!k || reserved.has(k)) set.add(u.id);
      if (seen.has(k)) {
        set.add(u.id);
        set.add(seen.get(k)!);
      } else seen.set(k, u.id);
    }
    return set;
  }, [draft, reservedCodes]);

  const single = selection.length === 1 ? selection[0] : null;
  const selUnit = single?.type === "unit" ? draft.units.find((u) => u.id === single.id) : undefined;
  const selSector = single?.type === "sector" ? draft.sectors.find((s) => s.id === single.id) : undefined;
  const selElement = single?.type === "element" ? draft.elements.find((e) => e.id === single.id) : undefined;
  const selectedUnits = draft.units.filter((u) => selectedIds.has(u.id));

  // ---- Selección ----
  const onSelect = (sel: Selection | null, opts?: { additive: boolean }) => {
    if (!sel) return setSelection([]);
    if (opts?.additive) {
      setSelection((cur) => (cur.some((s) => s.id === sel.id) ? cur.filter((s) => s.id !== sel.id) : [...cur, sel]));
    } else setSelection([sel]);
  };

  const onMarquee = (box: Box, opts: { additive: boolean }) => {
    const hits: Selection[] = [
      ...draft.units.filter((u) => overlaps(u, box)).map((u) => ({ type: "unit" as const, id: u.id })),
      ...draft.elements.filter((e) => overlaps(e, box)).map((e) => ({ type: "element" as const, id: e.id })),
    ];
    setSelection((cur) => {
      if (!opts.additive) return hits;
      const ids = new Set(cur.map((s) => s.id));
      return [...cur, ...hits.filter((h) => !ids.has(h.id))];
    });
  };

  // ---- Arrastre de la selección ----
  const onDragStart = () => {
    pushHistory();
    dragBase.current = { draft: draftRef.current, sets: movingSets(draftRef.current, selection) };
  };
  const onDragDelta = (dx: number, dy: number) => {
    const base = dragBase.current;
    if (!base) return;
    setDraft(moveBy(base.draft, base.sets, dx, dy));
    setDirty(true);
    setFeedback(null);
  };
  const onDragEnd = (moved: boolean) => {
    const base = dragBase.current;
    dragBase.current = null;
    if (!moved || !base) return;
    // Las unidades movidas sueltas toman el sector donde quedaron.
    setDraft((d) => ({
      ...d,
      units: d.units.map((u) => {
        if (!base.sets.units.has(u.id)) return u;
        if (u.sectorId && base.sets.sectors.has(u.sectorId)) return u;
        return { ...u, sectorId: sectorAt(d.sectors, u) };
      }),
    }));
  };

  // ---- Operaciones ----
  const addUnit = (kind: UnitKind) => {
    const id = tmpId();
    commit((d) => {
      const spot = findFreeSpot(d, kind.defaultW, kind.defaultH);
      const unit: PlanUnit = { id, kind: kind.code, code: `${kind.label} ${pad(nextNumber(d.units, kind.code))}`, rowLabel: "", sectorId: null, ...spot, w: kind.defaultW, h: kind.defaultH, outOfService: false, outOfServiceReason: "" };
      unit.sectorId = sectorAt(d.sectors, unit);
      return { ...d, units: [...d.units, unit] };
    });
    setSelection([{ type: "unit", id }]);
  };

  const addSector = () => {
    const id = tmpId();
    commit((d) => {
      const spot = findFreeSpot(d, 16, 6);
      return { ...d, sectors: [...d.sectors, { id, name: `Sector ${d.sectors.length + 1}`, ...spot, w: 16, h: 6 }] };
    });
    setSelection([{ type: "sector", id }]);
  };

  const addElement = (kind: (typeof ELEMENT_KINDS)[number]) => {
    const id = tmpId();
    commit((d) => {
      const isSea = kind.code === "mar";
      const spot = isSea ? { x: 0, y: d.height } : findFreeSpot(d, kind.w, kind.h);
      const el: PlanElement = { id, kind: kind.code, label: kind.label, ...spot, w: isSea ? d.width : kind.w, h: kind.h };
      return { ...d, elements: [...d.elements, el] };
    });
    setSelection([{ type: "element", id }]);
  };

  const removeSelected = React.useCallback(() => {
    if (!selection.length) return;
    const ids = new Set(selection.map((s) => s.id));
    commit((d) => ({
      ...d,
      units: d.units.filter((u) => !ids.has(u.id)).map((u) => (u.sectorId && ids.has(u.sectorId) ? { ...u, sectorId: null } : u)),
      sectors: d.sectors.filter((s) => !ids.has(s.id)),
      elements: d.elements.filter((e) => !ids.has(e.id)),
    }));
    setSelection([]);
  }, [selection, commit]);

  const duplicateSelected = React.useCallback(() => {
    if (!selection.length) return;
    const d0 = draftRef.current;
    const ids = new Set(selection.map((s) => s.id));
    const items: Box[] = [...d0.units, ...d0.elements, ...d0.sectors].filter((i) => ids.has((i as { id: string }).id));
    const minX = Math.min(...items.map((i) => i.x));
    const maxR = Math.max(...items.map((i) => i.x + i.w));
    const dx = maxR - minX + 1; // copia a la derecha del grupo
    const created: Selection[] = [];
    commit((d) => {
      let units = [...d.units];
      const newUnits: PlanUnit[] = [];
      for (const u of d.units.filter((x) => ids.has(x.id))) {
        const label = kinds.find((k) => k.code === u.kind)?.label ?? "Unidad";
        const nu = { ...u, id: tmpId(), x: u.x + dx, code: `${label} ${pad(nextNumber([...units, ...newUnits], u.kind))}`, sectorId: null };
        newUnits.push(nu);
        created.push({ type: "unit", id: nu.id });
      }
      units = [...units, ...newUnits];
      const elements = [...d.elements];
      for (const e of d.elements.filter((x) => ids.has(x.id))) {
        const ne = { ...e, id: tmpId(), x: e.x + dx };
        elements.push(ne);
        created.push({ type: "element", id: ne.id });
      }
      const sectors = [...d.sectors];
      for (const s of d.sectors.filter((x) => ids.has(x.id))) {
        const ns = { ...s, id: tmpId(), name: `${s.name} (copia)`, x: s.x + dx };
        sectors.push(ns);
        created.push({ type: "sector", id: ns.id });
      }
      return { ...d, units, elements, sectors };
    });
    setSelection(created);
  }, [selection, commit, kinds]);

  const nudge = React.useCallback((dx: number, dy: number) => {
    pushHistory();
    setDraft((d) => moveBy(d, movingSets(d, selection), dx, dy));
    setDirty(true);
  }, [pushHistory, selection]);

  const updateUnit = (patch: Partial<PlanUnit>) => selUnit && commit((d) => ({ ...d, units: d.units.map((u) => (u.id === selUnit.id ? { ...u, ...patch } : u)) }));
  const updateUnits = (patch: Partial<PlanUnit>) => commit((d) => ({ ...d, units: d.units.map((u) => (selectedIds.has(u.id) ? { ...u, ...patch } : u)) }));
  const updateSector = (patch: Partial<PlanSector>) => selSector && commit((d) => ({ ...d, sectors: d.sectors.map((s) => (s.id === selSector.id ? { ...s, ...patch } : s)) }));
  const updateElement = (patch: Partial<PlanElement>) => selElement && commit((d) => ({ ...d, elements: d.elements.map((e) => (e.id === selElement.id ? { ...e, ...patch } : e)) }));

  // Teclado
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undo();
        return;
      }
      if (mod && e.key.toLowerCase() === "a") {
        e.preventDefault();
        const d = draftRef.current;
        setSelection([...d.units.map((u) => ({ type: "unit" as const, id: u.id })), ...d.elements.map((x) => ({ type: "element" as const, id: x.id }))]);
        return;
      }
      if (e.key === "Escape") return setSelection([]);
      if (!selection.length) return;
      if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        duplicateSelected();
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        removeSelected();
        return;
      }
      const step = e.shiftKey ? 5 : 1;
      const delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
      if (!delta) return;
      e.preventDefault();
      nudge(delta[0], delta[1]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selection, undo, duplicateSelected, removeSelected, nudge]);

  const save = async () => {
    if (invalid.size) {
      setFeedback({ tone: "danger", text: "Corregí las unidades marcadas en rojo (identificador vacío o repetido) antes de guardar." });
      return;
    }
    setSaving(true);
    const toSave = cropToContent(draft);
    const res = await saveMapAction({ map: map.map, ...toSave });
    setSaving(false);
    if (res.ok) {
      setDirty(false);
      setHistory([]);
      setFeedback({ tone: "success", text: "Plano guardado. Los cambios ya están disponibles para todo el equipo." });
      router.refresh();
    } else {
      setFeedback({ tone: "danger", text: res.error });
    }
  };

  const tool = (label: string, Icon: LucideIcon, onClick: () => void, hint?: string) => (
    <button
      key={label}
      type="button"
      onClick={onClick}
      title={hint ?? `Agregar ${label.toLowerCase()}`}
      className="flex min-w-16 flex-col items-center gap-1 rounded-lg border border-line bg-white px-2 py-2 text-[11px] font-semibold text-ink transition-colors hover:border-sea hover:bg-foam/50"
    >
      <Icon className="size-5 text-sea" aria-hidden />
      {label}
    </button>
  );

  const other = MAPS.find((m) => m.id !== map.map)!;
  const selectionSummary = `${selection.length} seleccionados`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link href={`${basePath}?vista=${map.map}`}>
              <ArrowLeft /> Volver al plano
            </Link>
          </Button>
          <nav className="flex rounded-lg border border-line bg-white p-0.5" aria-label="Plano a editar">
            {MAPS.map((m) => (
              <Link
                key={m.id}
                href={`${basePath}/editor?vista=${m.id}`}
                onClick={(e) => {
                  if (dirty && !confirm("Tenés cambios sin guardar en este plano. ¿Salir sin guardar?")) e.preventDefault();
                }}
                aria-current={m.id === map.map ? "page" : undefined}
                className={cn("rounded-md px-3 py-1.5 text-sm font-semibold", m.id === map.map ? "bg-navy text-white" : "text-mist hover:text-navy")}
              >
                {m.label}
              </Link>
            ))}
          </nav>
          {dirty ? <Badge tone="warning">Cambios sin guardar</Badge> : <Badge tone="success">Guardado · v{draft.version}</Badge>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={undo} disabled={!history.length} title="Deshacer (Ctrl+Z)">
            <Undo2 /> Deshacer
          </Button>
          <ConfirmButton
            trigger={<Button variant="outline" size="sm"><Eraser /> Empezar de cero</Button>}
            title="¿Vaciar este plano?"
            description={`Se quitarán todas las unidades, sectores y elementos del plano de ${map.map === "playa" ? "playa" : "cocheras"}. El plano de ${other.label.toLowerCase()} no se modifica. Nada se borra hasta que guardes, y las unidades con reservas no podrán eliminarse.`}
            confirmLabel="Vaciar plano"
            onConfirm={() => {
              commit((d) => ({ ...d, units: [], sectors: [], elements: [] }));
              setSelection([]);
            }}
          />
          <Button onClick={save} disabled={saving || !dirty}>
            <Save /> {saving ? "Guardando…" : "Guardar cambios"}
          </Button>
        </div>
      </div>

      {feedback ? <Alert tone={feedback.tone}>{feedback.text}</Alert> : null}

      <Card className="p-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-wrap gap-2" role="toolbar" aria-label="Unidades reservables">
            {mapKinds.map((k) => tool(k.label, KIND_ICON[k.code] ?? Shapes, () => addUnit(k)))}
            {tool("Fila", Rows3, () => setRowDialog(true), "Agregar una fila de unidades numeradas")}
          </div>
          <span className="mx-1 hidden h-12 w-px bg-line sm:block" aria-hidden />
          <div className="flex flex-wrap gap-2" role="toolbar" aria-label="Otros elementos">
            {tool("Sector", LayoutGrid, addSector)}
            {ELEMENT_KINDS.filter((k) => (map.map === "cocheras" ? k.code !== "mar" : true)).map((k) => tool(k.label, ELEMENT_ICON[k.code], () => addElement(k)))}
          </div>
        </div>
      </Card>

      <div className="grid gap-4 2xl:grid-cols-[1fr_300px]">
        <Card className="overflow-hidden">
          <ZoomFrame
            width={draft.width}
            height={draft.height}
            toolbar={
              <span className="flex items-center gap-1.5 text-xs text-mist">
                <MousePointer2 className="size-3.5" aria-hidden />
                {selection.length > 1 ? selectionSummary : "Arrastrá sobre un área vacía para seleccionar varias unidades"}
              </span>
            }
          >
            {(cellPx) => (
              <MapCanvas
                ariaLabel={`Editor del plano de ${map.map}`}
                width={draft.width}
                height={draft.height}
                sectors={draft.sectors}
                elements={draft.elements}
                units={draft.units}
                selectedIds={selectedIds}
                invalid={invalid}
                editable
                cellPx={cellPx}
                onSelect={onSelect}
                onMarquee={onMarquee}
                onDragStart={onDragStart}
                onDragDelta={onDragDelta}
                onDragEnd={onDragEnd}
              />
            )}
          </ZoomFrame>
          <p className="border-t border-line px-3 py-2 text-xs text-mist">
            Clic para seleccionar · Shift + clic para sumar o quitar · arrastrá sobre un área vacía para seleccionar un grupo · arrastrá la selección para moverla · flechas para mover (Shift = 5 celdas) · Supr para eliminar · Ctrl+D duplicar · Ctrl+A seleccionar todo. El lienzo crece solo y se ajusta al contenido al guardar.
          </p>
        </Card>

        <Card className="h-fit p-4">
          {selection.length > 1 ? (
            <div className="space-y-3">
              <p className="text-sm font-bold text-navy">{selectionSummary}</p>
              <p className="text-xs text-mist">{selectedUnits.length} unidades · {selection.length - selectedUnits.length} otros elementos. Arrastrá cualquiera de ellos para mover el grupo completo.</p>
              {selectedUnits.length ? (
                <>
                  <Field label="Asignar sector" htmlFor="g-sector">
                    <Select id="g-sector" value="" onChange={(e) => e.target.value && updateUnits({ sectorId: e.target.value === "-" ? null : e.target.value })}>
                      <option value="">Elegir…</option>
                      <option value="-">Sin sector</option>
                      {draft.sectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </Select>
                  </Field>
                  <Field label="Fila" htmlFor="g-row"><Input id="g-row" placeholder="Ej.: A" onBlur={(e) => e.target.value && updateUnits({ rowLabel: e.target.value })} /></Field>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => updateUnits({ outOfService: true })}>Fuera de servicio</Button>
                    <Button size="sm" variant="outline" onClick={() => updateUnits({ outOfService: false, outOfServiceReason: "" })}>Habilitar</Button>
                  </div>
                </>
              ) : null}
              <SelectionActions onDuplicate={duplicateSelected} onDelete={removeSelected} />
            </div>
          ) : selUnit ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-navy">Unidad</p>
                <Badge tone="info">{kinds.find((k) => k.code === selUnit.kind)?.label}</Badge>
              </div>
              <Field label="Identificador" htmlFor="u-code" error={invalid.has(selUnit.id) ? "Identificador vacío o repetido." : undefined}>
                <Input id="u-code" value={selUnit.code} maxLength={40} onChange={(e) => updateUnit({ code: e.target.value })} aria-invalid={invalid.has(selUnit.id)} />
              </Field>
              {mapKinds.length > 1 ? (
                <Field label="Tipo" htmlFor="u-kind">
                  <Select
                    id="u-kind"
                    value={selUnit.kind}
                    onChange={(e) => {
                      const k = mapKinds.find((x) => x.code === e.target.value)!;
                      updateUnit({ kind: k.code, w: k.defaultW, h: k.defaultH });
                    }}
                  >
                    {mapKinds.map((k) => <option key={k.code} value={k.code}>{k.label}</option>)}
                  </Select>
                </Field>
              ) : null}
              <div className="grid grid-cols-2 gap-2">
                <Field label="Fila" htmlFor="u-row"><Input id="u-row" value={selUnit.rowLabel} maxLength={20} onChange={(e) => updateUnit({ rowLabel: e.target.value })} /></Field>
                <Field label="Sector" htmlFor="u-sector">
                  <Select id="u-sector" value={selUnit.sectorId ?? ""} onChange={(e) => updateUnit({ sectorId: e.target.value || null })}>
                    <option value="">Sin sector</option>
                    {draft.sectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </Select>
                </Field>
                <Field label="Ancho" htmlFor="u-w"><Input id="u-w" type="number" min={1} max={20} value={selUnit.w} onChange={(e) => updateUnit({ w: clamp(Number(e.target.value) || 1, 1, 20) })} /></Field>
                <Field label="Alto" htmlFor="u-h"><Input id="u-h" type="number" min={1} max={20} value={selUnit.h} onChange={(e) => updateUnit({ h: clamp(Number(e.target.value) || 1, 1, 20) })} /></Field>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={selUnit.outOfService} onChange={(e) => updateUnit({ outOfService: e.target.checked })} className="size-4 accent-navy" />
                Fuera de servicio
              </label>
              {selUnit.outOfService ? (
                <Field label="Motivo" htmlFor="u-reason"><Input id="u-reason" value={selUnit.outOfServiceReason} maxLength={200} onChange={(e) => updateUnit({ outOfServiceReason: e.target.value })} /></Field>
              ) : null}
              <SelectionActions onDuplicate={duplicateSelected} onDelete={removeSelected} />
            </div>
          ) : selSector ? (
            <div className="space-y-3">
              <p className="text-sm font-bold text-navy">Sector</p>
              <Field label="Nombre" htmlFor="s-name"><Input id="s-name" value={selSector.name} maxLength={60} onChange={(e) => updateSector({ name: e.target.value })} /></Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Ancho" htmlFor="s-w"><Input id="s-w" type="number" min={1} max={MAX_SIZE} value={selSector.w} onChange={(e) => updateSector({ w: clamp(Number(e.target.value) || 1, 1, MAX_SIZE - selSector.x) })} /></Field>
                <Field label="Alto" htmlFor="s-h"><Input id="s-h" type="number" min={1} max={MAX_SIZE} value={selSector.h} onChange={(e) => updateSector({ h: clamp(Number(e.target.value) || 1, 1, MAX_SIZE - selSector.y) })} /></Field>
              </div>
              <p className="text-xs text-mist">{draft.units.filter((u) => u.sectorId === selSector.id).length} unidades en este sector. Al moverlo se mueven sus unidades.</p>
              <SelectionActions onDuplicate={duplicateSelected} onDelete={removeSelected} />
            </div>
          ) : selElement ? (
            <div className="space-y-3">
              <p className="text-sm font-bold text-navy">Elemento del plano</p>
              <Field label="Tipo" htmlFor="e-kind">
                <Select id="e-kind" value={selElement.kind} onChange={(e) => updateElement({ kind: e.target.value as ElementKind })}>
                  {ELEMENT_KINDS.map((k) => <option key={k.code} value={k.code}>{k.label}</option>)}
                </Select>
              </Field>
              <Field label="Texto" htmlFor="e-label"><Input id="e-label" value={selElement.label} maxLength={60} onChange={(e) => updateElement({ label: e.target.value })} /></Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Ancho" htmlFor="e-w"><Input id="e-w" type="number" min={1} max={MAX_SIZE} value={selElement.w} onChange={(e) => updateElement({ w: clamp(Number(e.target.value) || 1, 1, MAX_SIZE - selElement.x) })} /></Field>
                <Field label="Alto" htmlFor="e-h"><Input id="e-h" type="number" min={1} max={MAX_SIZE} value={selElement.h} onChange={(e) => updateElement({ h: clamp(Number(e.target.value) || 1, 1, MAX_SIZE - selElement.y) })} /></Field>
              </div>
              <SelectionActions onDuplicate={duplicateSelected} onDelete={removeSelected} />
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-bold text-navy">Plano de {map.map === "playa" ? "playa" : "cocheras"}</p>
                <p className="mt-1 text-xs text-mist">Seleccioná una unidad o arrastrá sobre un área vacía para seleccionar varias. Este plano es independiente del de {other.label.toLowerCase()}.</p>
              </div>
              <dl className="grid grid-cols-3 gap-2 text-center text-xs">
                {mapKinds.map((k) => (
                  <div key={k.code} className="rounded-lg bg-sand/60 p-2">
                    <dt className="text-mist">{k.label}s</dt>
                    <dd className="text-lg font-extrabold text-navy">{draft.units.filter((u) => u.kind === k.code).length}</dd>
                  </div>
                ))}
                <div className="rounded-lg bg-sand/60 p-2">
                  <dt className="text-mist">Sectores</dt>
                  <dd className="text-lg font-extrabold text-navy">{draft.sectors.length}</dd>
                </div>
              </dl>
              {!draft.units.length && !draft.sectors.length ? (
                <Alert tone="info" title="Plano vacío">Empezá agregando un sector y luego tus {mapKinds.map((k) => k.label.toLowerCase() + "s").join(" y ")} desde la barra de herramientas.</Alert>
              ) : null}
            </div>
          )}
        </Card>
      </div>

      <RowDialog
        open={rowDialog}
        onOpenChange={setRowDialog}
        kinds={mapKinds}
        draft={draft}
        onCreate={(units) => {
          commit((d) => ({ ...d, units: [...d.units, ...units] }));
          setSelection(units.map((u) => ({ type: "unit", id: u.id })));
          setRowDialog(false);
        }}
      />
    </div>
  );
}

function SelectionActions({ onDuplicate, onDelete }: { onDuplicate: () => void; onDelete: () => void }) {
  return (
    <div className="flex gap-2 border-t border-line pt-3">
      <Button variant="outline" size="sm" onClick={onDuplicate}><Copy /> Duplicar</Button>
      <Button variant="ghost" size="sm" className="text-st-busy" onClick={onDelete}><Trash2 /> Eliminar</Button>
    </div>
  );
}

function RowDialog({ open, onOpenChange, kinds, draft, onCreate }: { open: boolean; onOpenChange: (o: boolean) => void; kinds: UnitKind[]; draft: Draft; onCreate: (u: PlanUnit[]) => void }) {
  const [kindCode, setKindCode] = React.useState(kinds[0]?.code ?? "");
  const kind = kinds.find((k) => k.code === kindCode) ?? kinds[0];
  const [count, setCount] = React.useState(8);
  const [start, setStart] = React.useState<number | "">("");
  const [prefix, setPrefix] = React.useState("");
  const [row, setRow] = React.useState("");
  const [gap, setGap] = React.useState(1);
  const [dir, setDir] = React.useState<"h" | "v">("h");
  const [sectorId, setSectorId] = React.useState("");
  const [error, setError] = React.useState("");
  if (!kind) return null;

  const first = start === "" ? nextNumber(draft.units, kind.code) : start;
  const label = prefix || kind.label;

  const create = () => {
    const n = clamp(count, 1, 80);
    const sector = draft.sectors.find((s) => s.id === sectorId);
    const span = dir === "h" ? n * (kind.defaultW + gap) - gap : n * (kind.defaultH + gap) - gap;
    if (span > MAX_SIZE) {
      setError("La fila es demasiado larga. Reducí la cantidad o la separación.");
      return;
    }
    const origin = sector ? { x: sector.x + 1, y: sector.y + 1 } : findFreeSpot(draft, dir === "h" ? span : kind.defaultW, dir === "h" ? kind.defaultH : span);
    const units: PlanUnit[] = Array.from({ length: n }, (_, i) => ({
      id: tmpId(),
      kind: kind.code,
      code: `${label} ${pad(first + i)}`,
      rowLabel: row,
      sectorId: sector?.id ?? null,
      x: dir === "h" ? origin.x + i * (kind.defaultW + gap) : origin.x,
      y: dir === "v" ? origin.y + i * (kind.defaultH + gap) : origin.y,
      w: kind.defaultW,
      h: kind.defaultH,
      outOfService: false,
      outOfServiceReason: "",
    }));
    setError("");
    onCreate(units);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Agregar una fila de unidades" description="Se crean unidades numeradas en forma consecutiva y quedan seleccionadas para que puedas moverlas juntas.">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tipo" htmlFor="r-kind">
            <Select id="r-kind" value={kind.code} onChange={(e) => setKindCode(e.target.value)}>
              {kinds.map((k) => <option key={k.code} value={k.code}>{k.label}</option>)}
            </Select>
          </Field>
          <Field label="Cantidad" htmlFor="r-count"><Input id="r-count" type="number" min={1} max={80} value={count} onChange={(e) => setCount(Number(e.target.value))} /></Field>
          <Field label="Prefijo" htmlFor="r-prefix" hint={`Ej.: ${label} ${pad(first)}`}><Input id="r-prefix" placeholder={kind.label} value={prefix} onChange={(e) => setPrefix(e.target.value)} /></Field>
          <Field label="Número inicial" htmlFor="r-start"><Input id="r-start" type="number" min={0} placeholder={String(nextNumber(draft.units, kind.code))} value={start} onChange={(e) => setStart(e.target.value === "" ? "" : Number(e.target.value))} /></Field>
          <Field label="Fila" htmlFor="r-row"><Input id="r-row" placeholder="A" value={row} onChange={(e) => setRow(e.target.value)} /></Field>
          <Field label="Separación (celdas)" htmlFor="r-gap"><Input id="r-gap" type="number" min={0} max={10} value={gap} onChange={(e) => setGap(clamp(Number(e.target.value), 0, 10))} /></Field>
          <Field label="Dirección" htmlFor="r-dir">
            <Select id="r-dir" value={dir} onChange={(e) => setDir(e.target.value as "h" | "v")}>
              <option value="h">Horizontal</option>
              <option value="v">Vertical</option>
            </Select>
          </Field>
          <Field label="Sector" htmlFor="r-sector">
            <Select id="r-sector" value={sectorId} onChange={(e) => setSectorId(e.target.value)}>
              <option value="">Primer lugar libre</option>
              {draft.sectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
        </div>
        {error ? <p className="mt-3 text-sm text-st-busy" role="alert">{error}</p> : null}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={create}><Rows3 /> Crear fila</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
