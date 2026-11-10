"use client";

import { Button } from "@/components/ui/button";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="grid min-h-[60vh] place-items-center px-6">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-extrabold text-navy">Algo salió mal</h1>
        <p className="mt-2 text-sm text-mist">
          No pudimos completar la operación. Si el problema persiste, contactá a soporte{error.digest ? ` indicando el código ${error.digest}` : ""}.
        </p>
        <Button className="mt-6" onClick={reset}>Reintentar</Button>
      </div>
    </div>
  );
}
