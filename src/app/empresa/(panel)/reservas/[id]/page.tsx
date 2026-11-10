import { ReservaDetailPage } from "@/features/reservas/pages";
import { requirePermission } from "@/server/auth/context";

export default async function Page(props: { params: Promise<{ id: string }> }) {
  const t = await requirePermission("reservas.manage");
  return <ReservaDetailPage role={t.role} id={(await props.params).id} />;
}
