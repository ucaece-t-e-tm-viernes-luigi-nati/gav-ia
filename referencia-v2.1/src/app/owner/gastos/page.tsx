import { GastosPage } from "@/features/gastos/page";

export default function Page(props: { searchParams: Promise<{ desde?: string; hasta?: string; categoria?: string }> }) {
  return <GastosPage searchParams={props.searchParams} />;
}
