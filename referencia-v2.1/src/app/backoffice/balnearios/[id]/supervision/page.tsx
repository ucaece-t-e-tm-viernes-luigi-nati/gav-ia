import { SupervisionPage } from "@/features/backoffice/supervision";

export default async function Page(props: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; vista?: string; fecha?: string; q?: string }> }) {
  return <SupervisionPage id={(await props.params).id} searchParams={props.searchParams} />;
}