import { ClienteDetailPage } from "@/features/clientes/pages";

export default async function Page(props: { params: Promise<{ id: string }> }) {
  return <ClienteDetailPage role="owner" id={(await props.params).id} />;
}
