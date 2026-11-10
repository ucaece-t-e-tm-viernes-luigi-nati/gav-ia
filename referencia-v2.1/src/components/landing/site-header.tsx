"use client";

import * as React from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "#inicio", label: "Inicio" },
  { href: "#funcionalidades", label: "Funcionalidades" },
  { href: "#como-funciona", label: "Cómo funciona" },
  { href: "#planes", label: "Planes" },
  { href: "#preguntas", label: "Preguntas frecuentes" },
];

export function SiteHeader() {
  const [open, setOpen] = React.useState(false);
  const [scrolled, setScrolled] = React.useState(false);
  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <header className={cn("sticky top-0 z-40 transition-colors", scrolled ? "border-b border-line bg-white/90 backdrop-blur" : "bg-transparent")}>
      <div className="container-page flex h-16 items-center justify-between gap-4">
        <Link href="#inicio" aria-label="GAVIA ERP, inicio"><Logo /></Link>
        <nav aria-label="Secciones" className="hidden items-center gap-7 text-sm font-medium text-ink/80 lg:flex">
          {LINKS.map((l) => <a key={l.href} href={l.href} className="hover:text-navy">{l.label}</a>)}
        </nav>
        <div className="flex items-center gap-2">
          <Button asChild className="px-5"><Link href="/login">Login</Link></Button>
          <button className="rounded-md p-2 lg:hidden" onClick={() => setOpen(!open)} aria-label={open ? "Cerrar menú" : "Abrir menú"} aria-expanded={open}>
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>
      {open ? (
        <nav aria-label="Secciones" className="border-t border-line bg-white px-4 py-3 lg:hidden">
          {LINKS.map((l) => <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="block rounded-md px-2 py-2.5 text-sm font-medium hover:bg-sand">{l.label}</a>)}
        </nav>
      ) : null}
    </header>
  );
}
