/** Secciones del backoffice que se habilitan una por una a cada superadmin. */
export const PLATFORM_PERMISSIONS = [
  { code: "dashboard", label: "Dashboard global", href: "/backoffice" },
  { code: "balnearios", label: "Balnearios (alta, estados y supervisión sin importes)", href: "/backoffice/balnearios" },
  { code: "crm", label: "CRM comercial", href: "/backoffice/crm" },
  { code: "calendario", label: "Calendario, tareas y demos agendadas", href: "/backoffice/calendario" },
  { code: "conversaciones", label: "Conversaciones comerciales", href: "/backoffice/conversaciones" },
  { code: "suscripciones", label: "Suscripciones", href: "/backoffice/suscripciones" },
  { code: "facturacion", label: "Facturación de GavIA", href: "/backoffice/facturacion" },
  { code: "reportes", label: "Reportes globales", href: "/backoffice/reportes" },
  { code: "usuarios", label: "Usuarios y permisos de GavIA", href: "/backoffice/usuarios" },
  { code: "planes", label: "Planes comerciales", href: "/backoffice/planes" },
  { code: "auditoria", label: "Auditoría", href: "/backoffice/auditoria" },
] as const;

export type PlatformPermission = (typeof PLATFORM_PERMISSIONS)[number]["code"];

export function firstBackofficePath(perms: readonly string[]): string | null {
  return PLATFORM_PERMISSIONS.find((p) => perms.includes(p.code))?.href ?? null;
}
