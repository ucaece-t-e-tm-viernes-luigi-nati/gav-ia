import { ClienteDetailPage } from "@/features/clientes/pages";

export default async function Page(props: { params: Promise<{ id: string }> }) {
  return <ClienteDetailPage role="admin" id={(await props.params).id} />;
}
