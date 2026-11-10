import { AdminDashboard, OwnerDashboard } from "@/features/dashboard/pages";
import { requirePermission } from "@/server/auth/context";

// Dueño: resumen financiero y operativo. Staff: operación del día (sin finanzas agregadas).
export default async function Page(props: { searchParams: Promise<{ desde?: string; hasta?: string }> }) {
  const t = await requirePermission("dashboard.view");
  return t.role === "owner" ? <OwnerDashboard searchParams={props.searchParams} /> : <AdminDashboard />;
}
