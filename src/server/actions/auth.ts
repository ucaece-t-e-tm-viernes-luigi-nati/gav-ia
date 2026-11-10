"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { ACTIVE_BALNEARIO_COOKIE, getViewer } from "@/server/auth/context";

/** Cierra la sesión del panel del balneario. */
export async function logoutAction() {
  try {
    await auth.api.signOut({ headers: await headers() });
  } catch {
    // ya no había sesión
  }
  (await cookies()).delete(ACTIVE_BALNEARIO_COOKIE);
  redirect("/empresa/ingresar");
}

/** Cambia el balneario activo (solo entre las membresías del usuario). */
export async function switchBalnearioAction(form: FormData) {
  const id = String(form.get("balnearioId") ?? "");
  const viewer = await getViewer();
  const m = viewer?.memberships.find((x) => x.balnearioId === id);
  if (!viewer || !m) redirect("/empresa/ingresar");
  (await cookies()).set(ACTIVE_BALNEARIO_COOKIE, m.balnearioId, { httpOnly: true, sameSite: "lax", path: "/", secure: process.env.NODE_ENV === "production" });
  redirect("/empresa");
}

/** Cierra la sesión de la plataforma del equipo. */
export async function platformLogoutAction() {
  try {
    await auth.api.signOut({ headers: await headers() });
  } catch {
    // ya no había sesión
  }
  redirect("/plataforma/ingresar");
}
