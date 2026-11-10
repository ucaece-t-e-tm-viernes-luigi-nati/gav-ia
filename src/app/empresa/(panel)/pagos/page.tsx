import { AdminCobrosPage } from "@/features/dashboard/pages";
import { OwnerPagosPage } from "@/features/owner/pages";
import { requirePermission } from "@/server/auth/context";
import { tenantCan } from "@/lib/permissions";

// Dueño: cobros y pagos completos (facturado / sin facturar, exportación). Staff: cobros a gestionar.
export default async function Page(props: { searchParams: Promise<{ desde?: string; hasta?: string; medio?: string }> }) {
  const t = await requirePermission("cobros.register");
  return tenantCan(t.role, "pagos.view") ? <OwnerPagosPage searchParams={props.searchParams} /> : <AdminCobrosPage />;
}
