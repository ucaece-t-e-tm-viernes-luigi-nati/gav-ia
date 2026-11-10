import { PlanPage } from "@/features/plan/page";

// Dueño: plan, abono, prueba, día de pago y pagos. Staff: solo los módulos incluidos (lo resuelve la página).
export default function Page(props: { searchParams: Promise<{ modulo?: string }> }) {
  return <PlanPage searchParams={props.searchParams} />;
}
