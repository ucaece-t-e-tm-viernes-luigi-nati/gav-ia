import {
  BadgeCheck, BarChart3, Building2, CalendarDays, CalendarRange, Coins, CreditCard, Handshake, Layers, LayoutDashboard, Map, MessageCircle,
  Receipt, ScrollText, Settings, UserCog, Users, Wallet, type LucideIcon,
} from "lucide-react";
import type { Module } from "@/lib/plan";
import type { PlatformPermission } from "@/lib/platform";

export type Area = "backoffice" | "owner" | "admin";
export type NavItem = { href: string; label: string; icon: LucideIcon; exact?: boolean; module?: Module; perm?: PlatformPermission };

export const NAV: Record<Area, NavItem[]> = {
  backoffice: [
    { href: "/backoffice", label: "Dashboard", icon: LayoutDashboard, exact: true, perm: "dashboard" },
    { href: "/backoffice/balnearios", label: "Balnearios", icon: Building2, perm: "balnearios" },
    { href: "/backoffice/crm", label: "CRM comercial", icon: Handshake, perm: "crm" },
    { href: "/backoffice/calendario", label: "Calendario y tareas", icon: CalendarDays, perm: "calendario" },
    { href: "/backoffice/conversaciones", label: "Conversaciones", icon: MessageCircle, perm: "conversaciones" },
    { href: "/backoffice/suscripciones", label: "Suscripciones", icon: Layers, perm: "suscripciones" },
    { href: "/backoffice/facturacion", label: "Facturación GAVIA", icon: Receipt, perm: "facturacion" },
    { href: "/backoffice/reportes", label: "Reportes", icon: BarChart3, perm: "reportes" },
    { href: "/backoffice/usuarios", label: "Usuarios", icon: UserCog, perm: "usuarios" },
    { href: "/backoffice/planes", label: "Planes", icon: CreditCard, perm: "planes" },
    { href: "/backoffice/auditoria", label: "Auditoría", icon: ScrollText, perm: "auditoria" },
  ],
  owner: [
    { href: "/owner", label: "Resumen", icon: LayoutDashboard, exact: true },
    { href: "/owner/plano", label: "Plano", icon: Map },
    { href: "/owner/reservas", label: "Reservas", icon: CalendarRange },
    { href: "/owner/clientes", label: "Clientes", icon: Users },
    { href: "/owner/pagos", label: "Cobros y pagos", icon: Wallet, module: "pagos" },
    { href: "/owner/gastos", label: "Gastos", icon: Coins },
    { href: "/owner/calendario", label: "Calendario", icon: CalendarDays },
    { href: "/owner/conversaciones", label: "Conversaciones", icon: MessageCircle, module: "whatsapp" },
    { href: "/owner/reportes", label: "Reportes", icon: BarChart3, module: "ocupacion" },
    { href: "/owner/usuarios", label: "Usuarios", icon: UserCog },
    { href: "/owner/configuracion", label: "Configuración", icon: Settings },
    { href: "/owner/plan", label: "Mi plan", icon: BadgeCheck },
    { href: "/owner/auditoria", label: "Actividad", icon: ScrollText },
  ],
  admin: [
    { href: "/admin", label: "Inicio", icon: LayoutDashboard, exact: true },
    { href: "/admin/plano", label: "Plano", icon: Map },
    { href: "/admin/reservas", label: "Reservas", icon: CalendarRange },
    { href: "/admin/clientes", label: "Clientes", icon: Users },
    { href: "/admin/cobros", label: "Cobros", icon: Wallet, module: "pagos" },
    { href: "/admin/calendario", label: "Calendario", icon: CalendarDays },
    { href: "/admin/conversaciones", label: "Conversaciones", icon: MessageCircle, module: "whatsapp" },
  ],
};

export const AREA_LABEL: Record<Area, string> = {
  backoffice: "Backoffice GAVIA",
  owner: "Panel del dueño",
  admin: "Panel operativo",
};
