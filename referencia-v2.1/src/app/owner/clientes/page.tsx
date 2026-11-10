import { ClientesPage } from "@/features/clientes/pages";

export default function Page(props: { searchParams: Promise<{ q?: string; saldo?: string }> }) {
  return <ClientesPage role="owner" searchParams={props.searchParams} />;
}
