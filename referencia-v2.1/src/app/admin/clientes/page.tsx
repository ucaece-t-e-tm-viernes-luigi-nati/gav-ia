import { ClientesPage } from "@/features/clientes/pages";

export default function Page(props: { searchParams: Promise<{ q?: string; saldo?: string }> }) {
  return <ClientesPage role="admin" searchParams={props.searchParams} />;
}
