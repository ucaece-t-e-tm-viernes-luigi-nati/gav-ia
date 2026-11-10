"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getViewer, homePathFor } from "@/server/auth/context";
import { requestPasswordReset, updatePassword } from "@/server/auth/session";

export type FormState = { error?: string; ok?: boolean };

const passwordSchema = z
  .object({
    password: z.string().min(10, { error: "La contraseña debe tener al menos 10 caracteres." }).max(72),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { error: "Las contraseñas no coinciden." });

export async function setPasswordAction(_prev: FormState, form: FormData): Promise<FormState> {
  const viewer = await getViewer();
  if (!viewer) return { error: "El enlace venció. Pedí uno nuevo desde “¿Olvidaste tu contraseña?”." };
  const parsed = passwordSchema.safeParse({ password: form.get("password"), confirm: form.get("confirm") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const res = await updatePassword(parsed.data.password);
  if (!res.ok) return { error: res.error };
  redirect(homePathFor(viewer));
}

export async function forgotPasswordAction(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = z.email().safeParse(form.get("email"));
  if (!parsed.success) return { error: "Ingresá un correo válido." };
  const res = await requestPasswordReset(parsed.data);
  if (!res.ok) return { error: res.error };
  return { ok: true };
}
