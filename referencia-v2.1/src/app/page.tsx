import Link from "next/link";
import {
  ArrowRight, BellRing, CalendarCheck2, CalendarRange, Car, Check, ClipboardList, Contact, CreditCard, FileSpreadsheet, LayoutDashboard, Lock,
  Map, MessageCircle, MousePointerClick, PencilRuler, QrCode, ShieldCheck, Smartphone, Tent, Umbrella, UserCog, Users, Wallet,
  type LucideIcon,
} from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/landing/site-header";
import { MiniPlano } from "@/components/landing/mini-plano";
import { ContactForm } from "@/components/landing/contact-form";

function SectionTitle({ eyebrow, title, text, center }: { eyebrow: string; title: string; text?: string; center?: boolean }) {
  return (
    <div className={center ? "mx-auto max-w-2xl text-center" : "max-w-2xl"}>
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-sea">{eyebrow}</p>
      <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-navy sm:text-4xl">{title}</h2>
      {text ? <p className="mt-4 text-base leading-relaxed text-mist">{text}</p> : null}
    </div>
  );
}

function Feature({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-6 transition-shadow hover:shadow-[0_8px_30px_rgb(18_59_93/0.06)]">
      <span className="grid size-10 place-items-center rounded-xl bg-foam text-sea"><Icon className="size-5" aria-hidden /></span>
      <h3 className="mt-4 font-bold text-navy">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-mist">{text}</p>
    </div>
  );
}

function ModuleBlock({ id, eyebrow, title, text, points, icon: Icon, reverse, visual }: { id?: string; eyebrow: string; title: string; text: string; points: string[]; icon: LucideIcon; reverse?: boolean; visual: React.ReactNode }) {
  return (
    <div id={id} className={`grid items-center gap-10 lg:grid-cols-2 ${reverse ? "lg:[&>*:first-child]:order-2" : ""}`}>
      <div>
        <span className="grid size-11 place-items-center rounded-xl bg-navy text-white"><Icon className="size-5" aria-hidden /></span>
        <p className="mt-5 text-xs font-bold uppercase tracking-[0.18em] text-sea">{eyebrow}</p>
        <h3 className="mt-2 text-2xl font-extrabold tracking-tight text-navy sm:text-3xl">{title}</h3>
        <p className="mt-3 leading-relaxed text-mist">{text}</p>
        <ul className="mt-5 space-y-2.5">
          {points.map((p) => (
            <li key={p} className="flex gap-2.5 text-sm"><Check className="mt-0.5 size-4 shrink-0 text-st-free" aria-hidden /> {p}</li>
          ))}
        </ul>
      </div>
      <div>{visual}</div>
    </div>
  );
}

function MockList({ title, rows }: { title: string; rows: { a: string; b: string; tag: string; tone: string }[] }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-5 shadow-[0_20px_50px_-20px_rgb(18_59_93/0.25)]">
      <div className="mb-3 flex items-center justify-between"><p className="text-sm font-bold text-navy">{title}</p><span className="rounded-full bg-sand px-2 py-0.5 text-[10px] font-semibold text-mist">Ilustración</span></div>
      <ul className="divide-y divide-line">
        {rows.map((r) => (
          <li key={r.a} className="flex items-center justify-between gap-3 py-2.5 text-sm">
            <div><p className="font-semibold">{r.a}</p><p className="text-xs text-mist">{r.b}</p></div>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${r.tone}`}>{r.tag}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const FAQ = [
  ["¿Necesito instalar algo?", "No. GAVIA funciona desde el navegador, en la computadora de la caseta, una tablet o el celular."],
  ["¿Puedo armar el plano igual a mi balneario?", "Sí. Cada balneario diseña su propio plano con un editor visual: carpas, sombrillas, cocheras, sectores, pasillos y numeración propia. Playa y cocheras tienen planos separados."],
  ["¿Mis administradores ven cuánto factura el balneario?", "No. El administrador ve lo necesario para operar y cobrar cada reserva, pero no la facturación total, los ingresos por período ni los reportes financieros."],
  ["¿Cómo funcionan los cobros con QR?", "GAVIA genera un QR de Mercado Pago por el saldo de la reserva. El pago se acredita en tu cuenta de Mercado Pago y la reserva se actualiza cuando el proveedor confirma la operación."],
  ["¿Qué pasa con la información de mi balneario?", "Es confidencial. Cada balneario tiene sus datos aislados y ningún administrador de GAVIA puede ver lo facturado ni los gastos. Los permisos se controlan en el servidor y en la base de datos, y las acciones sensibles quedan registradas."],
  ["¿Puedo probarlo antes de pagar?", "Sí. Tenés 15 días de prueba gratis para usar la plataforma con tu equipo. Al terminar, elegís tu plan."],
  ["¿Cómo se paga el plan?", "Los planes son anuales. Podés pagar el total del año en un solo pago con un 5 % de descuento, o abonarlo en cuotas mensuales. Si el plan no se renueva al vencer, el acceso se suspende hasta regularizar el pago."],
  ["¿Puedo sumar una función de otro plan?", "Sí. Por ejemplo, si tenés el plan START y querés sumar WhatsApp o la integración de pagos, se agrega por un costo adicional."],
];

export default function Home() {
  return (
    <div className="bg-white">
      <SiteHeader />
      <main>
        {/* Hero */}
        <section id="inicio" className="relative overflow-hidden">
          <div className="absolute inset-x-0 top-0 -z-10 h-[620px] bg-gradient-to-b from-foam/70 via-foam/20 to-white" aria-hidden />
          <div className="container-page grid items-center gap-12 pb-20 pt-12 lg:grid-cols-[1fr_1.15fr] lg:pt-20">
            <div className="animate-fade-up">
              <p className="inline-flex items-center gap-2 rounded-full border border-[#c4e2f4] bg-white/70 px-3 py-1 text-xs font-semibold text-sea">
                <Umbrella className="size-3.5" aria-hidden /> Software de gestión para balnearios
              </p>
              <h1 className="mt-5 text-4xl font-extrabold leading-[1.08] tracking-tight text-navy sm:text-5xl lg:text-[3.4rem]">
                Tu balneario, bajo control. <span className="text-sea">Todo en un solo lugar.</span>
              </h1>
              <p className="mt-5 max-w-xl text-lg leading-relaxed text-ink/75">
                Gestioná reservas, disponibilidad, clientes y pagos desde una única plataforma diseñada para la dinámica real de los balnearios.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button size="lg" asChild><Link href="/agendar-demo">Agendar demo gratuita <ArrowRight /></Link></Button>
                <Button size="lg" variant="outline" asChild><a href="#funcionalidades">Conocer la plataforma</a></Button>
              </div>
            </div>
            <div className="animate-fade-up rounded-3xl border border-line bg-white p-4 shadow-[0_30px_80px_-30px_rgb(18_59_93/0.35)] [animation-delay:120ms] sm:p-5">
              <MiniPlano />
            </div>
          </div>
        </section>

        {/* Problemas */}
        <section className="bg-sand/60 py-20">
          <div className="container-page">
            <SectionTitle eyebrow="El problema" title="La temporada no espera. Las planillas, sí." text="Cuadernos, planillas sueltas y chats de WhatsApp hacen que la información esté en todos lados y en ninguno." />
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Feature icon={FileSpreadsheet} title="Planillas desactualizadas" text="Cada persona anota en su lugar y nadie sabe con certeza qué carpa está libre." />
              <Feature icon={ClipboardList} title="Reservas superpuestas" text="Dos clientes con la misma sombrilla para la misma quincena es un problema evitable." />
              <Feature icon={Wallet} title="Saldos difíciles de seguir" text="Señas, pagos parciales y transferencias que no se cruzan con cada reserva." />
              <Feature icon={MessageCircle} title="Mensajes dispersos" text="Las consultas llegan por WhatsApp a distintos teléfonos y se pierden." />
            </div>
          </div>
        </section>

        {/* Diferencial */}
        <section className="bg-navy py-16 text-white">
          <div className="container-page text-center">
            <p className="mx-auto max-w-3xl text-2xl font-extrabold leading-snug sm:text-3xl">
              “No adaptamos un sistema a un balneario. Diseñamos el sistema alrededor del balneario.”
            </p>
          </div>
        </section>

        {/* Funcionalidades */}
        <section id="funcionalidades" className="py-24">
          <div className="container-page space-y-24">
            <SectionTitle center eyebrow="Funcionalidades" title="Todo lo que pasa en tu balneario, en una sola plataforma" />

            <ModuleBlock
              eyebrow="El corazón de GAVIA"
              title="Un plano interactivo que es tu balneario"
              text="Diseñá tu plano con carpas, sombrillas y cocheras ubicadas como en la realidad. Elegí las fechas y mirá al instante qué está libre, reservado u ocupado, y quién tiene saldo pendiente."
              icon={Map}
              points={[
                "Editor visual propio de cada balneario: sectores, filas, pasillos y numeración",
                "Planos separados para playa y para cocheras",
                "Disponibilidad por fecha o período: una unidad puede estar ocupada en enero y libre en febrero",
                "Ficha de cada unidad con reserva, cliente y estado del pago",
                "Reservas desde el plano, sin superposiciones",
              ]}
              visual={
                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    { icon: PencilRuler, t: "Editá tu distribución", d: "Agregá, mové y numerá unidades." },
                    { icon: MousePointerClick, t: "Clic en una unidad", d: "Ficha con reserva, cliente y saldo." },
                    { icon: Tent, t: "Carpas y sombrillas", d: "En el plano de playa." },
                    { icon: Car, t: "Cocheras", d: "En su propio plano." },
                  ].map((c) => (
                    <div key={c.t} className="rounded-2xl border border-line bg-[#fbfaf6] p-5">
                      <c.icon className="size-5 text-sea" aria-hidden />
                      <p className="mt-3 font-bold text-navy">{c.t}</p>
                      <p className="text-sm text-mist">{c.d}</p>
                    </div>
                  ))}
                </div>
              }
            />

            <ModuleBlock
              reverse
              eyebrow="Reservas"
              title="Reservas claras, sin dobles asignaciones"
              text="Cada reserva tiene sus unidades, fechas, importe, pagos y saldo. El sistema valida en el servidor que ninguna unidad quede reservada dos veces para el mismo período."
              icon={CalendarRange}
              points={["Vista de lista y de calendario por unidad", "Estados: pendiente, confirmada, finalizada y cancelada", "Cancelaciones con motivo y registro de auditoría"]}
              visual={<MockList title="Reservas de enero" rows={[
                { a: "Carpa 07 · 1 al 15/01", b: "Cliente de ejemplo", tag: "Confirmada", tone: "bg-foam text-navy" },
                { a: "Sombrilla 12 · 3 al 9/01", b: "Cliente de ejemplo", tag: "Pendiente", tone: "bg-st-held-bg text-[#8a5f0c]" },
                { a: "Carpa 21 + Cochera 05", b: "Cliente de ejemplo", tag: "Confirmada", tone: "bg-foam text-navy" },
              ]} />}
            />

            <ModuleBlock
              id="crm"
              eyebrow="CRM de clientes"
              title="Conocé a cada cliente"
              text="Fichas con contacto, WhatsApp, historial de reservas, unidades alquiladas, pagos, saldo y notas. Accedé desde el plano o desde una reserva."
              icon={Contact}
              points={["Búsqueda y filtros por saldo pendiente", "Historial de interacciones", "Datos sensibles visibles solo para el dueño"]}
              visual={<MockList title="Clientes" rows={[
                { a: "Cliente de ejemplo A", b: "3 temporadas · Carpa 03", tag: "Al día", tone: "bg-st-free-bg text-[#1f7a50]" },
                { a: "Cliente de ejemplo B", b: "Sombrilla 01", tag: "Saldo pendiente", tone: "bg-st-busy-bg text-[#9b2f2c]" },
              ]} />}
            />

            <ModuleBlock
              reverse
              eyebrow="Pagos y cobros"
              title="Cada peso, asociado a su reserva"
              text="Registrá efectivo, transferencias o posnet, y cobrá con QR de Mercado Pago directamente desde la reserva. El pago se confirma cuando Mercado Pago lo acredita, no cuando alguien toca un botón."
              icon={CreditCard}
              points={["Saldo de cada reserva siempre actualizado", "Cobros con QR dinámico de Mercado Pago", "Anulaciones solo por el dueño, con motivo y auditoría"]}
              visual={
                <div className="flex items-center gap-5 rounded-2xl border border-line bg-white p-6 shadow-[0_20px_50px_-20px_rgb(18_59_93/0.25)]">
                  <span className="grid size-24 place-items-center rounded-xl bg-foam"><QrCode className="size-14 text-navy" aria-hidden /></span>
                  <div className="text-sm">
                    <p className="font-bold text-navy">Cobrar saldo de la reserva</p>
                    <p className="mt-1 text-mist">El cliente escanea con la app de Mercado Pago y la reserva se actualiza al confirmarse el pago.</p>
                  </div>
                </div>
              }
            />

            <ModuleBlock
              eyebrow="Calendario y recordatorios"
              title="Nada se olvida"
              text="Tareas operativas, seguimientos de clientes y recordatorios de cobro, con vistas mensual, semanal y diaria. Los ingresos y salidas del día aparecen solos."
              icon={BellRing}
              points={["Recordatorios con responsable, fecha y hora", "Tareas vencidas visibles en el inicio", "Asociados a clientes o reservas"]}
              visual={<MockList title="Hoy" rows={[
                { a: "Confirmar seña de Carpa 02", b: "11:00 · Administración", tag: "Pendiente", tone: "bg-st-held-bg text-[#8a5f0c]" },
                { a: "Revisar lonas sector A", b: "08:00 · Mantenimiento", tag: "Tarea", tone: "bg-sand text-ink" },
              ]} />}
            />
          </div>
        </section>

        {/* Roles */}
        <section className="bg-[#fbfaf6] py-24">
          <div className="container-page">
            <SectionTitle center eyebrow="Paneles por rol" title="Cada persona ve lo que necesita" text="Los permisos se aplican en el servidor y en la base de datos, no solo ocultando botones." />
            <div className="mt-12 grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-line bg-white p-7">
                <LayoutDashboard className="size-6 text-sea" aria-hidden />
                <h3 className="mt-4 text-lg font-bold text-navy">Dueño del balneario</h3>
                <p className="mt-2 text-sm text-mist">Gestión completa: facturación, cobros, saldos, ocupación, reportes, usuarios, configuración del plano e integraciones.</p>
              </div>
              <div className="rounded-2xl border border-line bg-white p-7">
                <UserCog className="size-6 text-sea" aria-hidden />
                <h3 className="mt-4 text-lg font-bold text-navy">Administrador</h3>
                <p className="mt-2 text-sm text-mist">Panel operativo: plano, reservas, clientes, cobros de cada reserva, calendario y conversaciones. Sin acceso a la facturación total ni a credenciales.</p>
              </div>
            </div>
          </div>
        </section>

        {/* Cómo funciona */}
        <section id="como-funciona" className="py-24">
          <div className="container-page">
            <SectionTitle center eyebrow="Cómo funciona" title="En marcha antes de la temporada" />
            <ol className="mt-12 grid gap-6 md:grid-cols-4">
              {[
                ["Contanos cómo es tu balneario", "Unidades, sectores y forma de trabajo."],
                ["Diseñá tu plano", "Con el editor visual, para playa y cocheras."],
                ["Sumá a tu equipo", "Invitá a tus administradores con sus permisos."],
                ["Operá la temporada", "Reservas, cobros y clientes en un solo lugar."],
              ].map(([t, d], i) => (
                <li key={t} className="relative rounded-2xl border border-line p-6">
                  <span className="text-sm font-extrabold text-sea">0{i + 1}</span>
                  <p className="mt-2 font-bold text-navy">{t}</p>
                  <p className="mt-1 text-sm text-mist">{d}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Beneficios */}
        <section className="bg-navy py-24 text-white">
          <div className="container-page grid gap-10 lg:grid-cols-[1fr_1.2fr]">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-foam/70">Beneficios</p>
              <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">Menos tiempo administrando. Más control.</h2>
            </div>
            <div className="grid gap-6 sm:grid-cols-2">
              {[
                [Map, "Disponibilidad real", "Sabé al instante qué está libre en cualquier fecha."],
                [Wallet, "Cobros ordenados", "Saldos claros por reserva y por cliente."],
                [ShieldCheck, "Datos protegidos", "Información aislada por balneario y permisos por rol."],
                [Smartphone, "Desde cualquier lugar", "Funciona en computadora, tablet y celular."],
                [Users, "Equipo coordinado", "Todos trabajan sobre la misma información."],
                [Lock, "Trazabilidad", "Cancelaciones y correcciones quedan registradas."],
              ].map(([Icon, t, d]) => {
                const I = Icon as LucideIcon;
                return (
                  <div key={t as string} className="flex gap-3">
                    <I className="mt-0.5 size-5 shrink-0 text-foam" aria-hidden />
                    <div><p className="font-bold">{t as string}</p><p className="text-sm text-foam/70">{d as string}</p></div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Planes */}
        <section id="planes" className="py-24">
          <div className="container-page">
            <SectionTitle center eyebrow="Planes" title="Un plan para cada balneario" text="Empezá con 15 días de prueba gratis, sin pagar nada. Después elegí el plan anual que mejor se adapte a tu balneario." />
            <div className="mt-12 grid gap-4 lg:grid-cols-3">
              {[
                { n: "START", price: "399", d: "Para ordenar la operación diaria del balneario.", f: ["Plano interactivo", "Carpas, sombrillas y cocheras", "Disponibilidad por fechas", "Fichas completas de clientes"] },
                { n: "PRO", price: "899", d: "Para atender y vender más, con asistencia inteligente.", f: ["Todo lo del plan START", "Inteligencia artificial", "WhatsApp integrado", "Atención 24/7", "Consultas, recomendaciones y reservas", "Análisis de ocupación"], hl: true },
                { n: "PLUS", price: "1299", d: "Para controlar también los cobros y la contabilidad.", f: ["Todo lo del plan PRO", "Integración de pagos", "Historial de pagos y saldos pendientes", "Integración con Contabilium"] },
              ].map((p) => (
                <div key={p.n} className={`relative flex flex-col rounded-2xl border p-7 ${p.hl ? "border-navy bg-navy text-white shadow-xl lg:-translate-y-2" : "border-line bg-white"}`}>
                  {p.hl ? <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-sea px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.14em] text-white shadow">Recomendado</span> : null}
                  <p className={`text-sm font-bold uppercase tracking-wide ${p.hl ? "text-foam" : "text-sea"}`}>{p.n}</p>
                  <p className={`mt-2 text-sm ${p.hl ? "text-foam/80" : "text-mist"}`}>{p.d}</p>
                  <p className="mt-5 flex items-baseline gap-1.5">
                    <span className={`text-sm font-bold ${p.hl ? "text-foam/80" : "text-mist"}`}>U$D</span>
                    <span className="text-4xl font-extrabold tracking-tight">{p.price}</span>
                    <span className={`text-sm font-semibold ${p.hl ? "text-foam/80" : "text-mist"}`}>por año</span>
                  </p>
                  <p className={`mt-1 text-xs font-semibold ${p.hl ? "text-foam" : "text-st-free"}`}>
                    U$D {Math.round(Number(p.price) * 0.95).toLocaleString("es-AR")} pagando el total anual en un solo pago (5 % de descuento)
                  </p>
                  <ul className="mt-5 flex-1 space-y-2.5 text-sm">
                    {p.f.map((f) => <li key={f} className="flex gap-2"><Check className={`mt-0.5 size-4 shrink-0 ${p.hl ? "text-foam" : "text-st-free"}`} aria-hidden /> {f}</li>)}
                  </ul>
                </div>
              ))}
            </div>
            <div className="mx-auto mt-10 grid max-w-4xl gap-3 text-sm sm:grid-cols-3">
              <div className="rounded-xl border border-line bg-[#fbfaf6] p-4"><p className="font-bold text-navy">15 días de prueba gratis</p><p className="mt-1 text-mist">Probá la plataforma con tu equipo antes de pagar.</p></div>
              <div className="rounded-xl border border-line bg-[#fbfaf6] p-4"><p className="font-bold text-navy">5 % de descuento</p><p className="mt-1 text-mist">Si pagás el total del plan anual en un solo pago. Si no, podés abonarlo en cuotas mensuales.</p></div>
              <div className="rounded-xl border border-line bg-[#fbfaf6] p-4"><p className="font-bold text-navy">Armá tu plan</p><p className="mt-1 text-mist">¿Tenés START y querés sumar una función de otro plan? Se agrega por un costo adicional.</p></div>
            </div>
            <div className="mt-10 text-center">
              <Button size="lg" asChild><Link href="/agendar-demo"><CalendarCheck2 /> Agendar demo gratuita</Link></Button>
            </div>
          </div>
        </section>

        {/* Confidencialidad */}
        <section className="bg-navy py-16 text-white">
          <div className="container-page grid items-center gap-6 md:grid-cols-[auto_1fr]">
            <span className="grid size-14 place-items-center rounded-2xl bg-white/10"><Lock className="size-7 text-foam" aria-hidden /></span>
            <div>
              <h2 className="text-2xl font-extrabold tracking-tight">La información de tu balneario es confidencial</h2>
              <p className="mt-2 max-w-3xl text-foam/80">Ningún administrador de GAVIA puede ver lo que facturás ni tus gastos. Esa información queda bloqueada también en la base de datos, no solo en la pantalla: solo la ve el dueño del balneario.</p>
            </div>
          </div>
        </section>
        {/* FAQ */}
        <section id="preguntas" className="bg-sand/60 py-24">
          <div className="container-page grid gap-10 lg:grid-cols-[1fr_1.6fr]">
            <SectionTitle eyebrow="Preguntas frecuentes" title="Lo que suelen preguntarnos" />
            <div className="divide-y divide-sand-200 rounded-2xl border border-sand-200 bg-white">
              {FAQ.map(([q, a]) => (
                <details key={q} className="group px-6 py-5">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-navy">
                    {q}
                    <span className="text-xl text-sea transition-transform group-open:rotate-45" aria-hidden>+</span>
                  </summary>
                  <p className="mt-3 text-sm leading-relaxed text-mist">{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Contacto */}
        <section id="contacto" className="py-24">
          <div className="container-page grid gap-10 lg:grid-cols-[1fr_1.4fr]">
            <div>
              <SectionTitle eyebrow="Contacto" title="Coordinemos una demo" text="Te mostramos GAVIA con un plano parecido al de tu balneario y respondemos todas tus dudas." />
            </div>
            <div className="rounded-3xl bg-foam/60 p-2 sm:p-4"><ContactForm /></div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line bg-white">
        <div className="container-page flex flex-col gap-6 py-10 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Logo />
            <p className="mt-2 max-w-sm text-sm text-mist">Software de gestión integral para balnearios de la Costa Atlántica.</p>
          </div>
          <nav aria-label="Pie de página" className="flex flex-wrap gap-5 text-sm text-mist">
            <a href="#funcionalidades" className="hover:text-navy">Funcionalidades</a>
            <a href="#planes" className="hover:text-navy">Planes</a>
            <a href="#preguntas" className="hover:text-navy">Preguntas</a>
            <a href="#contacto" className="hover:text-navy">Contacto</a>
            <Link href="/login" className="font-semibold text-navy">Login</Link>
          </nav>
        </div>
        <p className="border-t border-line py-4 text-center text-xs text-mist">© {new Date().getFullYear()} GAVIA ERP</p>
      </footer>
    </div>
  );
}
