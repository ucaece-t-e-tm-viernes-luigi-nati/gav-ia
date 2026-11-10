import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { MiniPlano } from "@/components/landing/mini-plano";
import { getViewer, homePathFor } from "@/server/auth/context";
import { env } from "@/server/env";
import { DEMO_USERS } from "@/server/db/seed";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Ingresar" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  let viewer = null;
  let configError: string | null = null;
  try {
    viewer = await getViewer();
  } catch (e) {
    configError = e instanceof Error ? e.message : "Error de configuración";
  }
  if (viewer && error !== "sin-acceso") redirect(homePathFor(viewer));
  const demo = env.mode === "demo" && (!env.isProduction || env.previewDemo);

  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1.1fr]">
      <div className="flex flex-col px-6 py-8 sm:px-12">
        <div className="flex items-center justify-between">
          <Link href="/"><Logo /></Link>
          <Link href="/" className="inline-flex items-center gap-1 text-sm text-mist hover:text-navy">
            <ArrowLeft className="size-4" /> Volver al sitio
          </Link>
        </div>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-12">
          <h1 className="text-3xl font-extrabold tracking-tight text-navy">Ingresá a GAVIA</h1>
          <p className="mt-2 text-sm text-mist">Usá el correo y la contraseña de tu cuenta. Te llevamos directo a tu panel.</p>
          {error === "sin-acceso" ? (
            <p className="mt-4 rounded-lg bg-st-held-bg p-3 text-sm text-[#8a5f0c]">Tu cuenta no tiene un balneario asignado. Contactá al dueño del establecimiento o a GAVIA.</p>
          ) : null}
          {error === "enlace-invalido" ? (
            <p className="mt-4 rounded-lg bg-st-held-bg p-3 text-sm text-[#8a5f0c]">El enlace no es válido o ya venció. Pedí uno nuevo desde “¿Olvidaste tu contraseña?”.</p>
          ) : null}
          {configError ?<p className="mt-4 rounded-lg bg-st-busy-bg p-3 text-sm text-[#9b2f2c]">{configError}</p> : null}
          <LoginForm />
          {demo ? (
            <div className="mt-8 rounded-xl border border-dashed border-sand-200 bg-sand/50 p-4 text-sm">
              <p className="font-semibold text-navy">Cuentas de demostración ({env.previewDemo ? "demo de revisión" : "solo entorno local"})</p>
              <p className="mt-1 text-xs text-mist">
                La contraseña es el valor de <code className="rounded bg-white px-1">GAVIA_DEMO_PASSWORD</code> configurado en el servidor. Datos ficticios: estas cuentas no existen en producción.
              </p>
              <ul className="mt-3 space-y-1 text-xs">
                {DEMO_USERS.map((u) => (
                  <li key={u.email} className="flex justify-between gap-2">
                    <code className="text-ink">{u.email}</code>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
      <div className="relative hidden overflow-hidden bg-navy lg:block">
        <div className="absolute inset-0 opacity-30 sea-edge" />
        <div className="relative flex h-full flex-col justify-center px-16">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-foam/60">GAVIA ERP</p>
          <p className="mt-4 max-w-md text-3xl font-extrabold leading-tight text-white">Tu balneario, bajo control. Todo en un solo lugar.</p>
          <div className="mt-10 max-w-lg rounded-2xl bg-white p-4 shadow-2xl">
            <MiniPlano compact />
          </div>
        </div>
      </div>
    </div>
  );
}
