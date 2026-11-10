import type { Metadata } from "next";
import Link from "next/link";
import { Mail, PauseCircle } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { requireViewer } from "@/server/auth/context";
import { logoutAction } from "@/server/actions/auth";

export const metadata: Metadata = { title: "Acceso suspendido" };

const SUPPORT_EMAIL = "gaviaerp@gmail.com";

const MESSAGES: Record<string, { title: string; text: string }> = {
  prueba_vencida: {
    title: "Terminó el período de prueba",
    text: "Los 15 días de prueba gratuita finalizaron y no registramos el pago del plan. Para seguir usando GAVIA, comunicate con soporte.",
  },
  sin_renovar: {
    title: "No registramos el pago de la renovación",
    text: "El plan anual de GAVIA de este balneario venció y no fue renovado, por eso el acceso está suspendido. Para reactivarlo, comunicate con soporte.",
  },
  suspendido: {
    title: "Cuenta suspendida",
    text: "El acceso a este balneario está suspendido porque no registramos el pago del plan. Para reactivarlo, comunicate con soporte.",
  },
};

export default async function SuspendedPage({ searchParams }: { searchParams: Promise<{ estado?: string }> }) {
  const viewer = await requireViewer();
  const { estado } = await searchParams;
  const msg = MESSAGES[estado ?? ""] ?? MESSAGES.suspendido;
  const others = viewer.memberships.filter((m) => m.access === "ok" || m.access === "prueba");
  return (
    <div className="grid min-h-screen place-items-center bg-sand/40 px-6">
      <div className="max-w-md rounded-2xl border border-line bg-white p-8 text-center shadow-sm">
        <Logo className="justify-center" />
        <PauseCircle className="mx-auto mt-8 size-10 text-st-held" aria-hidden />
        <h1 className="mt-4 text-xl font-extrabold text-navy">{msg.title}</h1>
        <p className="mt-2 text-sm text-mist">{msg.text}</p>
        <a href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Reactivación de cuenta GAVIA")}`} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-foam px-4 py-2.5 text-sm font-bold text-navy hover:bg-[#cbe6f6]">
          <Mail className="size-4" /> {SUPPORT_EMAIL}
        </a>
        <p className="mt-3 text-xs text-mist">Tus datos se conservan: al reactivar la cuenta, todo vuelve a estar disponible.</p>
        <div className="mt-6 flex flex-col gap-2">
          {others.length ? <Button variant="outline" asChild><Link href={others[0].role === "owner" ? "/owner" : "/admin"}>Ir a {others[0].balnearioName}</Link></Button> : null}
          <form action={logoutAction}><Button type="submit" variant="ghost" className="w-full">Cerrar sesión</Button></form>
        </div>
      </div>
    </div>
  );
}
