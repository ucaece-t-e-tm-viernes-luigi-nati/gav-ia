"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { signIn, signOut } from "@/server/auth/session";
import { ACTIVE_BALNEARIO_COOKIE, getViewer, homePathFor } from "@/server/auth/context";

const loginSchema = z.object({
  email: z.email({ error: "Ingresá un correo válido." }),
  password: z.string().min(1, { error: "Ingresá tu contraseña." }),
});

export type LoginState = { error?: string; email?: string };

export async function loginAction(_prev: LoginState, form: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({ email: form.get("email"), password: form.get("password") });
  const email = String(form.get("email") ?? "");
  if (!parsed.success) return { error: parsed.error.issues[0]?.message, email };
  let target: string;
  try {
    const res = await signIn(parsed.data.email, parsed.data.password);
    if (!res.ok) return { error: res.error, email };
    // El rol se resuelve en el servidor a partir de la base de datos.
    const viewer = await getViewer();
    if (!viewer) return { error: "No se pudo iniciar la sesión.", email };
    target = homePathFor(viewer);
  } catch (e) {
    console.error("[GAVIA] Error de login", e);
    return { error: e instanceof Error && e.message.startsWith("Falta") ? e.message : "No se pudo conectar con el servidor de autenticación.", email };
  }
  redirect(target);
}

export async function logoutAction() {
  await signOut();
  redirect("/login");
}

export async function switchBalnearioAction(form: FormData) {
  const id = String(form.get("balnearioId") ?? "");
  const viewer = await getViewer();
  const m = viewer?.memberships.find((x) => x.balnearioId === id);
  if (!viewer || !m) redirect("/login");
  (await cookies()).set(ACTIVE_BALNEARIO_COOKIE, m.balnearioId, { httpOnly: true, sameSite: "lax", path: "/" });
  redirect(m.role === "owner" ? "/owner" : "/admin");
}
