import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="grid min-h-screen place-items-center bg-sand/40 px-6">
      <div className="text-center">
        <Logo className="justify-center" />
        <h1 className="mt-8 text-2xl font-extrabold text-navy">No encontramos esta página</h1>
        <p className="mt-2 text-sm text-mist">Puede que el enlace sea incorrecto o que no tengas acceso a este recurso.</p>
        <Button asChild className="mt-6">
          <Link href="/">Volver al inicio</Link>
        </Button>
      </div>
    </div>
  );
}
