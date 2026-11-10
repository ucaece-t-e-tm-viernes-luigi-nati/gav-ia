import type { Metadata } from "next";
import Link from "next/link";
import { env } from "@/server/env";
import { ForgotPasswordForm } from "../account-forms";

export const metadata: Metadata = { title: "Recuperar contraseña" };

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="text-2xl font-extrabold text-navy">Recuperar contraseña</h1>
      {env.mode === "demo" ? (
        <p className="mt-4 text-sm text-mist">En el modo demostración no se envían correos. La contraseña de las cuentas demo está en la configuración del servidor.</p>
      ) : (
        <>
          <p className="mt-2 text-sm text-mist">
            Pedile al dueño de tu balneario (o al equipo de GAVIA) que te genere una contraseña temporal desde Usuarios. Si el envío de correos está configurado, también podés pedir un enlace acá.
          </p>
          <ForgotPasswordForm />
        </>
      )}
      <Link href="/login" className="mt-6 block text-center text-sm font-semibold text-sea">Volver al ingreso</Link>
    </>
  );
}
