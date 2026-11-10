import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { asUser } from "@/server/db";
import { getAuthUserId } from "./session";
import { hasModule, type Module } from "@/lib/plan";
import { firstBackofficePath, type PlatformPermission } from "@/lib/platform";

export type TenantRole = "owner" | "admin";

export type Access = "ok" | "prueba" | "prueba_vencida" | "sin_renovar" | "suspendido";
export type Membership = { balnearioId: string; balnearioName: string; role: TenantRole; isDemo: boolean; modules: string[]; access: Access; trialEnd: string | null };

export type Viewer = {
  id: string;
  email: string;
  fullName: string;
  isSuperadmin: boolean;
  /** Secciones del backoffice habilitadas (solo superadmins). */
  platformPermissions: string[];
  memberships: Membership[];
};

export type Tenant = {
  viewer: Viewer;
  balnearioId: string;
  balnearioName: string;
  role: TenantRole;
  /** Módulos habilitados por el plan vigente del balneario (leídos de la base). */
  modules: string[];
  access: Access;
  trialEnd: string | null;
};

export const ACTIVE_BALNEARIO_COOKIE = "gavia_balneario";

/** Estados sin acceso al panel: suspendido, prueba vencida o plan anual sin renovar. */
const BLOCKED: Access[] = ["suspendido", "prueba_vencida", "sin_renovar"];

/**
 * Carga el usuario y sus roles desde la base (fuente confiable), nunca desde
 * datos enviados por el navegador. Se memoriza por request.
 */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const uid = await getAuthUserId();
  if (!uid) return null;
  return asUser(uid, async (db) => {
    const profile = await db.one<{ id: string; email: string; full_name: string; platform_role: string | null; platform_permissions: string[] }>(
      `select id, email, full_name, platform_role, platform_permissions from profiles where id = auth.uid()`,
    );
    if (!profile) return null;
    const memberships = await db.many<{ balneario_id: string; name: string; role: TenantRole; is_demo: boolean; modules: string[]; access: { estado: Access; fin_prueba: string | null } | null }>(
      `select m.balneario_id, b.name, m.role, b.is_demo, balneario_modules(b.id) as modules, balneario_access(b.id) as access
         from memberships m join balnearios b on b.id = m.balneario_id
        where m.user_id = auth.uid() and m.active
        order by b.name`,
    );
    return {
      id: profile.id,
      email: profile.email,
      fullName: profile.full_name || profile.email,
      isSuperadmin: profile.platform_role === "superadmin",
      platformPermissions: profile.platform_role === "superadmin" ? (profile.platform_permissions ?? []) : [],
      memberships: memberships.map((m) => ({ balnearioId: m.balneario_id, balnearioName: m.name, role: m.role, isDemo: m.is_demo, modules: m.modules ?? [], access: m.access?.estado ?? "ok", trialEnd: m.access?.fin_prueba ?? null })),
    };
  });
});

export function homePathFor(viewer: Viewer): string {
  if (viewer.isSuperadmin) return firstBackofficePath(viewer.platformPermissions) ?? "/backoffice/sin-permisos";
  if (viewer.memberships.some((m) => m.role === "owner")) return "/owner";
  if (viewer.memberships.some((m) => m.role === "admin")) return "/admin";
  return "/login?error=sin-acceso";
}

export async function requireViewer(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  return viewer;
}

export async function requireSuperadmin(permission?: PlatformPermission): Promise<Viewer> {
  const viewer = await requireViewer();
  if (!viewer.isSuperadmin) redirect(homePathFor(viewer));
  if (permission && !viewer.platformPermissions.includes(permission)) redirect(homePathFor(viewer));
  return viewer;
}

/** Para Server Actions del backoffice: superadmin con el permiso de la sección. */
export async function superadminFor(permission: PlatformPermission): Promise<Viewer | null> {
  const viewer = await getViewer();
  return viewer?.isSuperadmin && viewer.platformPermissions.includes(permission) ? viewer : null;
}

/** Exige una membresía activa con el rol indicado y resuelve el balneario activo. */
export async function requireTenant(role: TenantRole): Promise<Tenant> {
  const viewer = await requireViewer();
  const candidates = viewer.memberships.filter((m) => m.role === role);
  if (!candidates.length) redirect(homePathFor(viewer));
  const selected = (await cookies()).get(ACTIVE_BALNEARIO_COOKIE)?.value;
  const m = candidates.find((c) => c.balnearioId === selected) ?? candidates[0];
  // Prueba vencida o cuenta suspendida: no se accede al panel.
  if (BLOCKED.includes(m.access)) redirect(`/suspendido?estado=${m.access}`);
  return { viewer, balnearioId: m.balnearioId, balnearioName: m.balnearioName, role, modules: m.modules, access: m.access, trialEnd: m.trialEnd };
}

/** Exige un módulo del plan; si no está incluido, muestra la página de plan no incluido. */
export async function requireModule(role: TenantRole, module: Module): Promise<Tenant> {
  const t = await requireTenant(role);
  if (!hasModule(t.modules, module)) redirect(`/${role}/plan?modulo=${module}`);
  return t;
}

/** Versión para Server Actions: devuelve null en lugar de redirigir. */
export async function tenantForAction(roles: TenantRole[]): Promise<Tenant | null> {
  const viewer = await getViewer();
  if (!viewer) return null;
  const selected = (await cookies()).get(ACTIVE_BALNEARIO_COOKIE)?.value;
  const candidates = viewer.memberships.filter((m) => roles.includes(m.role));
  const m = candidates.find((c) => c.balnearioId === selected) ?? candidates[0];
  if (!m || BLOCKED.includes(m.access)) return null;
  return { viewer, balnearioId: m.balnearioId, balnearioName: m.balnearioName, role: m.role, modules: m.modules, access: m.access, trialEnd: m.trialEnd };
}

/** Versión para Server Actions con verificación de módulo del plan. */
export async function tenantWithModule(roles: TenantRole[], module: Module): Promise<Tenant | "sin-modulo" | null> {
  const t = await tenantForAction(roles);
  if (!t) return null;
  return hasModule(t.modules, module) ? t : "sin-modulo";
}
