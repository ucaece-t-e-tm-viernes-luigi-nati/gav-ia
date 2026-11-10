import { NuevaReservaPage } from "@/features/reservas/pages";
import { requirePermission } from "@/server/auth/context";

export default async function Page() {
  const t = await requirePermission("reservas.manage");
  return <NuevaReservaPage role={t.role} />;
}
