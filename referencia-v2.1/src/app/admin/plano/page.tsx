import { PlanoPage } from "@/features/plano/pages";

export default function Page(props: { searchParams: Promise<{ vista?: string; desde?: string; hasta?: string }> }) {
  return <PlanoPage role="admin" searchParams={props.searchParams} />;
}
