import type { Metadata } from "next";
import { requireViewer } from "@/server/auth/context";
import { SetPasswordForm } from "../account-forms";

export const metadata: Metadata = { title: "Definir contraseña" };

export default async function SetPasswordPage() {
  const viewer = await requireViewer();
  return (
    <>
      <h1 className="text-2xl font-extrabold text-navy">Definí tu contraseña</h1>
      <p className="mt-2 text-sm text-mist">Cuenta: {viewer.email}</p>
      <SetPasswordForm />
    </>
  );
}
