import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { requireSuperadmin as requirePlatformUser } from "@/lib/guards";
import { hasModule, type Module } from "@/lib/plan";
import { isReadOnlyStatus, tenantCan, type TenantPermission, type TenantRole } from "@/lib/permissions";
import type { PlatformPermission } from "@/lib/platform";
import { asUser } from "@/server/db";

export type { TenantRole } from "@/lib/permissions";

/** Estado comercial del balneario (skill §7). paused / cancelled → panel en solo lectura. */
export type ClientStatus = "trial" | "active" | "past_due" | "paused" | "cancelled";
export type Membership = {
  balnearioId: string;
  balnearioName: string;
  role: TenantRole;
  isDemo: boolean;
  modules: string[];
  status: ClientStatus;
  trialEnd: string | null;
};

export type Viewer = {
  id: string;
  email: string;
  fullName: string;
  mustChangePassword: boolean;
  isSuperadmin: boolean;
  /** Secciones del backoffice habilitadas (equipo de GavIA). */
  platformPermissions: string[];
  memberships: Membership[];
};

export type Tenant = {
  viewer: Viewer;
  balnearioId: string;
  balnearioName: string;
  role: TenantRole;
  /** Módulos habilitados por el plan del balneario (leídos de la base). */
  modules: string[];
  status: ClientStatus;
  readOnly: boolean;
  trialEnd: string | null;
  isDemo: boolean;
};

export const ACTIVE_BALNEARIO_COOKIE = "gavia_balneario";

/**
 * Carga el usuario (sesión de better-auth) y sus roles desde la base (fuente confiable),
 * nunca desde datos enviados por el navegador. Se memoriza por request.
 */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const user = await getCurrentUser();
  if (!user) return null;
  return asUser(user.id, async (db) => {
    const profile = await db.one<{ id: string; email: string; full_name: string; platform_role: string | null; platform_permissions: string[] }>(
      `select id, email, full_name, platform_role, platform_permissions from profiles where id = auth.uid()`,
    );
    if (!profile) return null;
    const memberships = await db.many<{ balneario_id: string; name: string; role: TenantRole; is_demo: boolean; modules: string[]; access: { estado: ClientStatus; fin_prueba: string | null } | null }>(
      `select m.balneario_id, b.name, m.role, b.is_demo, balneario_modules(b.id) as modules, balneario_access(b.id) as access
         from memberships m join balnearios b on b.id = m.balneario_id
        where m.user_id = auth.uid() and m.active
        order by b.name`,
    );
    return {
      id: profile.id,
      email: profile.email,
      fullName: profile.full_name || profile.email,
      mustChangePassword: user.mustChangePassword,
      isSuperadmin: profile.platform_role === "superadmin",
      platformPermissions: profile.platform_role === "superadmin" ? (profile.platform_permissions ?? []) : [],
      memberships: memberships.map((m) => ({
        balnearioId: m.balneario_id,
        balnearioName: m.name,
        role: m.role,
        isDemo: m.is_demo,
        modules: m.modules ?? [],
        status: m.access?.estado ?? "active",
        trialEnd: m.access?.fin_prueba ?? null,
      })),
    };
  });
});

/** Balneario activo (cookie) entre las membresías del usuario. El balneario SIEMPRE sale de acá, nunca del formulario. */
async function activeTenant(viewer: Viewer): Promise<Tenant | null> {
  if (!viewer.memberships.length) return null;
  const selected = (await cookies()).get(ACTIVE_BALNEARIO_COOKIE)?.value;
  const m = viewer.memberships.find((c) => c.balnearioId === selected) ?? viewer.memberships[0];
  return {
    viewer,
    balnearioId: m.balnearioId,
    balnearioName: m.balnearioName,
    role: m.role,
    modules: m.modules,
    status: m.status,
    readOnly: isReadOnlyStatus(m.status),
    trialEnd: m.trialEnd,
    isDemo: m.isDemo,
  };
}

/**
 * Panel del balneario: sesión + membresía activa. Sin sesión o sin membresía → 404 (no revela la ruta).
 * Con contraseña temporal → a cambiarla. Si se indica un rol y no coincide → 404.
 */
export const requireTenant = cache(async (role?: TenantRole): Promise<Tenant> => {
  const viewer = await getViewer();
  if (!viewer) notFound();
  const t = await activeTenant(viewer);
  if (!t) notFound();
  if (viewer.mustChangePassword) redirect("/empresa/cambiar-clave");
  if (role && t.role !== role) notFound();
  return t;
});

/** Exige un permiso de la matriz (src/lib/permissions.ts). Sin permiso → 404. */
export async function requirePermission(permission: TenantPermission): Promise<Tenant> {
  const t = await requireTenant();
  if (!tenantCan(t.role, permission)) notFound();
  return t;
}

/** Exige un módulo del plan; si no está incluido, muestra la página del plan. */
export async function requireModule(role: TenantRole, module: Module): Promise<Tenant> {
  const t = await requireTenant(role);
  if (!hasModule(t.modules, module)) redirect(`/empresa/plan?modulo=${module}`);
  return t;
}

/**
 * Para Server Actions y route handlers: devuelve null (en lugar de redirigir) si no hay sesión,
 * si el rol no corresponde, si falta cambiar la contraseña temporal o si el balneario está en solo lectura.
 */
export async function tenantForAction(roles: TenantRole[]): Promise<Tenant | null> {
  const viewer = await getViewer();
  if (!viewer || viewer.mustChangePassword) return null;
  const t = await activeTenant(viewer);
  if (!t || !roles.includes(t.role) || t.readOnly) return null;
  return t;
}

/** Igual que tenantForAction pero para lecturas (exportaciones): permite el modo solo lectura. */
export async function tenantForRead(roles: TenantRole[]): Promise<Tenant | null> {
  const viewer = await getViewer();
  if (!viewer || viewer.mustChangePassword) return null;
  const t = await activeTenant(viewer);
  return t && roles.includes(t.role) ? t : null;
}

/** Versión para Server Actions con verificación de módulo del plan. */
export async function tenantWithModule(roles: TenantRole[], module: Module): Promise<Tenant | "sin-modulo" | null> {
  const t = await tenantForAction(roles);
  if (!t) return null;
  return hasModule(t.modules, module) ? t : "sin-modulo";
}

// ---------------- Equipo de GavIA (/plataforma) ----------------

/** Equipo de la plataforma (404 si no). Los permisos por sección los vuelven a validar las RLS de la v2.1. */
export async function requireSuperadmin(permission?: PlatformPermission): Promise<Viewer> {
  await requirePlatformUser();
  const viewer = await getViewer();
  if (!viewer?.isSuperadmin) notFound();
  if (permission && !viewer.platformPermissions.includes(permission)) notFound();
  return viewer;
}

/** Para Server Actions de la plataforma: equipo con el permiso de la sección. */
export async function superadminFor(permission: PlatformPermission): Promise<Viewer | null> {
  const viewer = await getViewer();
  return viewer?.isSuperadmin && viewer.platformPermissions.includes(permission) ? viewer : null;
}
