"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { asService } from "@/server/db";

export type ContactState = { ok?: boolean; error?: string };

const schema = z.object({
  name: z.string().trim().min(2, { error: "Ingresá tu nombre." }).max(100),
  business: z.string().trim().min(2, { error: "Ingresá el nombre del balneario." }).max(120),
  city: z.string().trim().max(100),
  email: z.email({ error: "Ingresá un correo válido." }),
  phone: z.string().trim().max(40),
  message: z.string().trim().max(2000),
});

const recent = new Map<string, number[]>();

/** Formulario público: crea un prospecto en el CRM comercial de GavIA. */
export async function contactAction(_prev: ContactState, form: FormData): Promise<ContactState> {
  if (form.get("website")) return { ok: true }; // campo trampa anti-bots
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const now = Date.now();
  const hits = (recent.get(ip) ?? []).filter((t) => now - t < 3600_000);
  if (hits.length >= 5) return { error: "Recibimos varias solicitudes desde tu conexión. Probá más tarde." };
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const v = parsed.data;
  try {
    await asService((db) =>
      db.exec(
        `insert into leads (business_name, contact_name, phone, email, city, source, notes) values ($1, $2, $3, $4, $5, 'Formulario web', $6)`,
        [v.business, v.name, v.phone, v.email, v.city, v.message],
      ),
    );
    recent.set(ip, [...hits, now]);
    return { ok: true };
  } catch (e) {
    console.error("[GavIA] Error en formulario de contacto", e);
    return { error: "No pudimos enviar tu consulta. Intentá nuevamente en unos minutos." };
  }
}
