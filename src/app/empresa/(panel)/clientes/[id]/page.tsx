import { ClienteDetailPage } from "@/features/clientes/pages";
import { requirePermission } from "@/server/auth/context";

export default async function Page(props: { params: Promise<{ id: string }> }) {
  const t = await requirePermission("clientes.manage");
  return <ClienteDetailPage role={t.role} id={(await props.params).id} />;
}
