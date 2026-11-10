"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { KeyRound, LogOut, Menu, X } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { cn, initials } from "@/lib/utils";
import { AREA_LABEL, NAV, type Area } from "./nav";
import { logoutAction, platformLogoutAction, switchBalnearioAction } from "@/server/actions/auth";
import type { TenantPermission } from "@/lib/permissions";

type Props = {
  area: Area;
  user: { name: string; email: string };
  balneario?: { id: string; name: string; options: { id: string; name: string }[] };
  demo: boolean;
  /** Módulos del plan del balneario; el menú oculta lo que el plan no incluye. */
  modules?: string[];
  /** Permisos del rol en el balneario (matriz de src/lib/permissions.ts); el menú oculta lo que no corresponde. */
  permissions?: readonly TenantPermission[];
  /** Aviso fijo arriba del contenido (por ejemplo, días de prueba restantes). */
  notice?: string;
  children: React.ReactNode;
};

export function AppShell({ area, user, balneario, demo, modules, permissions, notice, children }: Props) {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => setOpen(false), [pathname]);

  const nav = (
    <nav aria-label="Navegación principal" className="flex flex-col gap-0.5">
      {NAV[area].filter((item) => (!item.module || modules?.includes(item.module)) && (!item.perm || !!permissions?.includes(item.perm))).map((item) => {
        const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active ? "bg-white/12 text-white" : "text-foam/70 hover:bg-white/6 hover:text-white",
            )}
          >
            <Icon className={cn("size-4", active ? "text-foam" : "text-foam/50")} aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  const sidebar = (
    <div className="flex h-full flex-col bg-navy px-3 py-4">
      <div className="px-2 pb-5">
        <Link href={NAV[area][0].href} aria-label="Ir al inicio del panel">
          <Logo light />
        </Link>
        <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-foam/50">{AREA_LABEL[area]}</p>
      </div>
      {balneario ? (
        <div className="mb-4 px-1">
          {balneario.options.length > 1 ? (
            <form action={switchBalnearioAction}>
              <label htmlFor="balneario-switch" className="sr-only">Balneario activo</label>
              <select
                id="balneario-switch"
                name="balnearioId"
                defaultValue={balneario.id}
                onChange={(e) => e.currentTarget.form?.requestSubmit()}
                className="w-full rounded-lg border border-white/15 bg-white/8 px-2 py-2 text-sm text-white"
              >
                {balneario.options.map((o) => (
                  <option key={o.id} value={o.id} className="text-ink">{o.name}</option>
                ))}
              </select>
            </form>
          ) : (
            <div className="rounded-lg border border-white/10 bg-white/6 px-3 py-2 text-sm font-semibold text-white">{balneario.name}</div>
          )}
        </div>
      ) : null}
      <div className="flex-1 overflow-y-auto">{nav}</div>
      <div className="mt-4 border-t border-white/10 pt-4">
        <div className="flex items-center gap-3 px-2">
          <span className="grid size-8 place-items-center rounded-full bg-sea text-xs font-bold text-white">{initials(user.name)}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white">{user.name}</p>
            <p className="truncate text-xs text-foam/60">{user.email}</p>
          </div>
          {area === "empresa" ? (
            <Link href="/empresa/cambiar-clave" className="rounded-md p-1.5 text-foam/70 hover:bg-white/10 hover:text-white" aria-label="Cambiar contraseña" title="Cambiar contraseña">
              <KeyRound className="size-4" />
            </Link>
          ) : null}
          <form action={area === "empresa" ? logoutAction : platformLogoutAction}>
            <button type="submit" className="rounded-md p-1.5 text-foam/70 hover:bg-white/10 hover:text-white" aria-label="Cerrar sesión" title="Cerrar sesión">
              <LogOut className="size-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#fafaf7]">
      {demo ? (
        <div className="bg-st-held-bg px-4 py-1.5 text-center text-xs font-semibold text-[#8a5f0c]">
          Balneario de demostración · datos ficticios
        </div>
      ) : null}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:block" style={demo ? { top: 28 } : undefined}>
        {sidebar}
      </aside>
      {open ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button className="absolute inset-0 bg-navy-900/40" aria-label="Cerrar menú" onClick={() => setOpen(false)} />
          <div className="relative h-full w-72 max-w-[85%]">
            {sidebar}
            <button className="absolute right-3 top-3 rounded-md p-1 text-white" onClick={() => setOpen(false)} aria-label="Cerrar menú">
              <X className="size-5" />
            </button>
          </div>
        </div>
      ) : null}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-white/90 px-4 backdrop-blur lg:hidden">
          <button onClick={() => setOpen(true)} className="rounded-md p-1.5 hover:bg-sand" aria-label="Abrir menú">
            <Menu className="size-5" />
          </button>
          <Logo />
        </header>
        {notice ? <div className="border-b border-[#c4e2f4] bg-foam px-4 py-2 text-center text-xs font-semibold text-navy">{notice}</div> : null}
        <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
