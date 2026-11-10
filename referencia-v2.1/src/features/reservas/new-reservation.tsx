"use client";

import { useRouter } from "next/navigation";
import { ReservationWizard } from "./reservation-wizard";

export function NewReservation({ base, from, to, allowPayment }: { base: string; from: string; to: string; allowPayment: boolean }) {
  const router = useRouter();
  return <ReservationWizard from={from} to={to} allowPayment={allowPayment} onCancel={() => router.push(base)} onDone={(r) => router.push(`${base}/${r.id}`)} />;
}
