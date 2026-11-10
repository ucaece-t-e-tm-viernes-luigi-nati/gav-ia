import { TenantConversationsPage } from "@/features/conversaciones/pages";

export default function Page(props: { searchParams: Promise<{ c?: string; q?: string; estado?: string }> }) {
  return <TenantConversationsPage role="owner" searchParams={props.searchParams} />;
}
