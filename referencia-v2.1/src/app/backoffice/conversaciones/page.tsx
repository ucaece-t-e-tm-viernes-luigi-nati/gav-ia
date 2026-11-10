import { GaviaConversationsPage } from "@/features/conversaciones/pages";

export default function Page(props: { searchParams: Promise<{ c?: string; q?: string; estado?: string }> }) {
  return <GaviaConversationsPage searchParams={props.searchParams} />;
}
