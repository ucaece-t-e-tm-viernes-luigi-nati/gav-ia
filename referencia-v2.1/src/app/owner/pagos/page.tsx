import { OwnerPagosPage } from "@/features/owner/pages";

export default function Page(props: { searchParams: Promise<{ desde?: string; hasta?: string; medio?: string }> }) {
  return <OwnerPagosPage searchParams={props.searchParams} />;
}
