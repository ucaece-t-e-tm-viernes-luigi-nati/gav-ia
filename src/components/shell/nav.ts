import {
  BadgeCheck, BarChart3, Building2, CalendarDays, CalendarRange, ClipboardList, Coins, CreditCard, Handshake, Inbox, LayoutDashboard, Mail, Map, MessageCircle,
  ScrollText, Send, Settings, ShieldCheck, UserCog, Users, Wallet, type LucideIcon,
} from "lucide-react";
import type { Module } from "@/lib/plan";
import type { TenantPermission } from "@/lib/permissions";

export type Area = "empresa" | "plataforma";
export type NavItem = { href: string; label: string; icon: LucideIcon; exact?: boolean; module?: Module; perm?: TenantPermission };

export const NAV: Record<Area, NavItem[]> = {
  // Panel del balneario: el menú se filtra con la matriz de permisos (dueño / staff) y los módulos del plan.
  empresa: [
    { href: "/empresa", label: "Resumen", icon: LayoutDashboard, exact: true, perm: "dashboard.view" },
    { href: "/empresa/plano", label: "Plano", icon: Map, perm: "plano.view" },
    { href: "/empresa/reservas", label: "Reservas", icon: CalendarRange, perm: "reservas.manage" },
    { href: "/empresa/clientes", label: "Clientes", icon: Users, perm: "clientes.manage" },
    { href: "/empresa/pagos", label: "Cobros y pagos", icon: Wallet, module: "pagos", perm: "cobros.register" },
    { href: "/empresa/gastos", label: "Gastos", icon: Coins, perm: "gastos.manage" },
    { href: "/empresa/calendario", label: "Calendario", icon: CalendarDays, perm: "calendario.view" },
    { href: "/empresa/conversaciones", label: "Conversaciones", icon: MessageCircle, module: "whatsapp", perm: "conversaciones.manage" },
    { href: "/empresa/reportes", label: "Reportes", icon: BarChart3, module: "ocupacion", perm: "reportes.view" },
    { href: "/empresa/usuarios", label: "Usuarios", icon: UserCog, perm: "usuarios.manage" },
    { href: "/empresa/configuracion", label: "Configuración", icon: Settings, perm: "config.manage" },
    { href: "/empresa/plan", label: "Plan y pagos", icon: BadgeCheck, perm: "plan.view" },
    { href: "/empresa/auditoria", label: "Actividad", icon: ScrollText, perm: "auditoria.view" },
  ],
  // Plataforma del equipo de GavIA (todas las secciones para superadmin y admins del equipo).
  plataforma: [
    { href: "/plataforma", label: "Resumen", icon: LayoutDashboard, exact: true },
    { href: "/plataforma/solicitudes", label: "Solicitudes", icon: Inbox },
    { href: "/plataforma/empresas", label: "Balnearios", icon: Building2 },
    { href: "/plataforma/invitaciones", label: "Invitaciones", icon: Send },
    { href: "/plataforma/crm", label: "CRM y demos", icon: Handshake },
    { href: "/plataforma/calendario", label: "Calendario", icon: CalendarDays },
    { href: "/plataforma/conversaciones", label: "Conversaciones", icon: MessageCircle },
    { href: "/plataforma/reportes", label: "Reportes", icon: BarChart3 },
    { href: "/plataforma/planes", label: "Planes", icon: CreditCard },
    { href: "/plataforma/mails", label: "Mails", icon: Mail },
    { href: "/plataforma/equipo", label: "Equipo", icon: ShieldCheck },
    { href: "/plataforma/auditoria", label: "Auditoría", icon: ClipboardList },
  ],
};

export const AREA_LABEL: Record<Area, string> = {
  empresa: "Panel del balneario",
  plataforma: "Plataforma GavIA",
};
