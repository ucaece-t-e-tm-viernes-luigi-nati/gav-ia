import { CrmPage } from "@/features/backoffice/pages";

export default function Page(props: { searchParams: Promise<{ lead?: string }> }) {
  return <CrmPage searchParams={props.searchParams} />;
}
