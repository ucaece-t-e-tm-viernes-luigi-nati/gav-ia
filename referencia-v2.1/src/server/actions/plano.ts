"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { asUser, dbErrorMessage } from "@/server/db";
import { tenantForAction } from "@/server/auth/context";
import { canEditPlano, listUnitKinds, PlanoError, saveSiteMap } from "@/server/repos/plano";
import type { ActionResult } from "@/lib/utils";

const id = z.string().min(1).max(64);
const box = { x: z.int().min(0).max(200), y: z.int().min(0).max(200), w: z.int().min(1).max(200), h: z.int().min(1).max(200) };

const draftSchema = z.object({
  map: z.enum(["playa", "cocheras"]),
  width: z.int().min(10).max(200),
  height: z.int().min(10).max(200),
  version: z.int().min(0),
  sectors: z.array(z.object({ id, name: z.string().trim().min(1, { error: "Todos los sectores necesitan nombre." }).max(60), ...box })).max(100),
  elements: z.array(z.object({ id, kind: z.enum(["pasillo", "mar", "edificio", "etiqueta", "acceso", "otro"]), label: z.string().trim().max(60), ...box })).max(300),
  units: z
    .array(
      z.object({
        id,
        kind: z.string().min(1).max(30),
        code: z.string().trim().min(1, { error: "Todas las unidades necesitan un identificador." }).max(40),
        rowLabel: z.string().trim().max(20),
        sectorId: id.nullable(),
        ...box,
        w: z.int().min(1).max(20),
        h: z.int().min(1).max(20),
        outOfService: z.boolean(),
        outOfServiceReason: z.string().trim().max(200),
      }),
    )
    .max(2000),
});

export type SaveMapInput = z.input<typeof draftSchema>;

export async function saveMapAction(input: SaveMapInput): Promise<ActionResult<{ version: number }>> {
  const t = await tenantForAction(["owner", "admin"]);
  if (!t) return { ok: false, error: "Tu sesión expiró. Volvé a ingresar." };
  const parsed = draftSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos del plano inválidos." };
  const draft = parsed.data;

  const codes = new Map<string, number>();
  for (const u of draft.units) codes.set(u.code.toLowerCase(), (codes.get(u.code.toLowerCase()) ?? 0) + 1);
  const dup = [...codes.entries()].filter(([, n]) => n > 1).map(([c]) => c);
  if (dup.length) return { ok: false, error: `Hay identificadores repetidos: ${dup.join(", ")}.` };
  const outside = [...draft.units, ...draft.sectors, ...draft.elements].some((b) => b.x + b.w > draft.width || b.y + b.h > draft.height);
  if (outside) return { ok: false, error: "Hay elementos fuera de los límites del plano. Ampliá el plano o reubicalos." };

  try {
    const version = await asUser(t.viewer.id, async (db) => {
      if (!(await canEditPlano(db, t.balnearioId))) throw new PlanoError("No tenés permiso para modificar la estructura del plano.");
      const kinds = await listUnitKinds(db);
      const invalid = draft.units.find((u) => kinds.find((k) => k.code === u.kind)?.map !== draft.map);
      if (invalid) throw new PlanoError(`${invalid.code} no puede ubicarse en este plano.`);
      return saveSiteMap(db, t.balnearioId, draft);
    });
    revalidatePath("/owner/plano");
    revalidatePath("/admin/plano");
    return { ok: true, data: { version }, message: "Plano guardado." };
  } catch (e) {
    if (e instanceof PlanoError) return { ok: false, error: e.message };
    return { ok: false, error: dbErrorMessage(e) };
  }
}
