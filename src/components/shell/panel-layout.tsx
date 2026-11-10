import { AppShell } from "./app-shell";
import { requireSuperadmin } from "@/lib/guards";
import { requireTenant } from "@/server/auth/context";
import { TENANT_PERMISSIONS } from "@/lib/permissions";
import { daysBetweenInclusive, formatDate, todayISO } from "@/lib/dates";

const READ_ONLY_TEXT: Record<string, string> = {
  paused: "Tu cuenta está pausada por falta de pago: el panel queda en modo solo lectura. Tus datos están a salvo; al registrar el pago se reactiva.",
  cancelled: "Tu cuenta está dada de baja: el panel queda en modo solo lectura. Escribinos para reactivarla.",
};

/** Panel del balneario (/empresa): guard en el servidor (404 sin sesión o sin membresía) + menú según la matriz de permisos. */
export async function TenantLayout({ children }: { children: React.ReactNode }) {
  const t = await requireTenant();
  const options = t.viewer.memberships.map((m) => ({ id: m.balnearioId, name: m.balnearioName }));
  const daysLeft = t.status === "trial" && t.trialEnd ? daysBetweenInclusive(todayISO(), t.trialEnd) : null;
  const notice = t.readOnly
    ? READ_ONLY_TEXT[t.status]
    : t.status === "past_due"
      ? "Tu abono está vencido. Regularizalo para evitar la pausa del servicio (ver Plan y pagos)."
      : daysLeft !== null && daysLeft > 0
        ? `Período de prueba gratuito: ${daysLeft === 1 ? "queda 1 día" : `quedan ${daysLeft} días`} (hasta el ${formatDate(t.trialEnd)}, fecha límite del primer pago).`
        : undefined;
  return (
    <AppShell
      area="empresa"
      user={{ name: t.viewer.fullName, email: t.viewer.email }}
      balneario={{ id: t.balnearioId, name: t.balnearioName, options }}
      demo={t.isDemo}
      modules={t.modules}
      permissions={TENANT_PERMISSIONS[t.role]}
      notice={notice}
    >
      {children}
    </AppShell>
  );
}

/** Plataforma del equipo de GavIA (/plataforma): guard en el servidor (404 si no es del equipo). */
export async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const user = await requireSuperadmin();
  return (
    <AppShell area="plataforma" user={{ name: user.name || user.email, email: user.email }} demo={false}>
      {children}
    </AppShell>
  );
}
