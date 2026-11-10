import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { asService } from "@/server/db";
import { upcomingSlots } from "@/lib/demo-slots";
import { DemoBooking } from "./booking";

export const metadata: Metadata = { title: "Agendar demo gratuita" };
export const dynamic = "force-dynamic";

export default async function AgendarDemoPage() {
  const offered = upcomingSlots();
  // Solo se consultan los horarios ocupados (sin datos personales).
  let taken = new Set<string>();
  let unavailable = false;
  try {
    const rows = await asService((db) =>
      db.many<{ starts_at: string }>(`select starts_at from demo_bookings where status <> 'cancelada' and starts_at >= now()`),
    );
    taken = new Set(rows.map((r) => new Date(r.starts_at).toISOString()));
  } catch {
    unavailable = true;
  }
  const days = unavailable ? [] : offered.map((d) => ({ date: d.date, slots: d.slots.filter((s) => !taken.has(s)) })).filter((d) => d.slots.length);

  return (
    <div className="min-h-screen bg-gradient-to-b from-foam/60 to-white">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <div className="flex items-center justify-between">
          <Link href="/"><Logo /></Link>
          <Link href="/" className="inline-flex items-center gap-1 text-sm text-mist hover:text-navy"><ArrowLeft className="size-4" /> Volver al sitio</Link>
        </div>
        <div className="mt-10 max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-sea">Demo gratuita</p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-navy sm:text-4xl">Agendá una demo de GavIA</h1>
          <p className="mt-3 text-mist">30 minutos para mostrarte el plano interactivo, las reservas y el panel de tu equipo. Después podés probar la plataforma gratis durante 15 días.</p>
        </div>
        <div className="mt-8"><DemoBooking days={days} /></div>
      </div>
    </div>
  );
}
