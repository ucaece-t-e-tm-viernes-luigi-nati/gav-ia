import { AppShell } from "./app-shell";
import { requireSuperadmin, requireTenant, type TenantRole } from "@/server/auth/context";
import { env } from "@/server/env";
import { daysBetweenInclusive, formatDate, todayISO } from "@/lib/dates";

export async function TenantLayout({ role, children }: { role: TenantRole; children: React.ReactNode }) {
  const t = await requireTenant(role);
  const options = t.viewer.memberships.filter((m) => m.role === role).map((m) => ({ id: m.balnearioId, name: m.balnearioName }));
  const daysLeft = t.access === "prueba" && t.trialEnd ? daysBetweenInclusive(todayISO(), t.trialEnd) : null;
  const notice = daysLeft !== null
    ? `Período de prueba gratuito: ${daysLeft === 1 ? "queda 1 día" : `quedan ${daysLeft} días`} (hasta el ${formatDate(t.trialEnd)}).${role === "owner" ? " Contratá tu plan de contado (5 % de descuento) o en cuotas." : ""}`
    : undefined;
  return (
    <AppShell
      area={role}
      user={{ name: t.viewer.fullName, email: t.viewer.email }}
      balneario={{ id: t.balnearioId, name: t.balnearioName, options }}
      demo={env.mode === "demo"}
      modules={t.modules}
      notice={notice}
    >
      {children}
    </AppShell>
  );
}

export async function BackofficeLayout({ children }: { children: React.ReactNode }) {
  const v = await requireSuperadmin();
  return (
    <AppShell area="backoffice" user={{ name: v.fullName, email: v.email }} demo={env.mode === "demo"} permissions={v.platformPermissions}>
      {children}
    </AppShell>
  );
}
