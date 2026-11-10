import { ClientesPage } from "@/features/clientes/pages";
import { requirePermission } from "@/server/auth/context";

export default async function Page(props: { searchParams: Promise<{ q?: string; saldo?: string }> }) {
  const t = await requirePermission("clientes.manage");
  return <ClientesPage role={t.role} searchParams={props.searchParams} />;
}
