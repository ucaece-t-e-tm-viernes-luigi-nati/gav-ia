import { PlanoEditorPage } from "@/features/plano/pages";

export default function Page(props: { searchParams: Promise<{ vista?: string }> }) {
  return <PlanoEditorPage role="admin" searchParams={props.searchParams} />;
}
