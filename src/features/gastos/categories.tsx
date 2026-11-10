"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/form";
import { renameCategoryAction, deleteCategoryAction } from "@/server/actions/gastos";

export function CategoryRow({ id, name, count, locked }: { id: string; name: string; count: number; locked?: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);
  const [value, setValue] = React.useState(name);
  const [error, setError] = React.useState("");
  return (
    <li className="flex items-center gap-2 px-4 py-2 text-sm">
      {editing ? (
        <form
          className="flex flex-1 gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await renameCategoryAction({ id, name: value });
            if (!r.ok) return setError(r.error);
            setEditing(false);
            router.refresh();
          }}
        >
          <Input aria-label="Nombre de la categoría" className="h-8" value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
          <button className="text-xs font-semibold text-sea" type="submit">Guardar</button>
        </form>
      ) : (
        <>
          <span className="flex-1">{name}</span>
          <span className="text-xs text-mist">{count} {count === 1 ? "gasto" : "gastos"}</span>
          <button className="rounded p-1 text-mist hover:bg-sand" aria-label={`Renombrar ${name}`} onClick={() => setEditing(true)}><Pencil className="size-3.5" /></button>
          {locked ? <span className="text-[11px] text-mist">predeterminada</span> : <button
            className="rounded p-1 text-mist hover:bg-sand hover:text-st-busy"
            aria-label={`Eliminar ${name}`}
            onClick={async () => {
              if (!window.confirm(`¿Eliminar la categoría “${name}”?`)) return;
              const r = await deleteCategoryAction({ id });
              if (!r.ok) setError(r.error);
              router.refresh();
            }}
          >
            <Trash2 className="size-3.5" />
          </button>}
        </>
      )}
      {error ? <span className="text-xs text-st-busy">{error}</span> : null}
    </li>
  );
}
