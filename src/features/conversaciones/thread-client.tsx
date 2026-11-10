"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, Textarea } from "@/components/ui/form";
import { sendMessageAction, updateConversationAction } from "@/server/actions/conversaciones";

export function Composer({ area, conversationId, enabled }: { area: "tenant" | "gavia"; conversationId: string; enabled: boolean }) {
  const router = useRouter();
  const [body, setBody] = React.useState("");
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  return (
    <form
      className="border-t border-line p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const r = await sendMessageAction({ area, conversationId, body });
        setBusy(false);
        if (!r.ok) return setError(r.error);
        setBody("");
        setError("");
        router.refresh();
      }}
    >
      <div className="flex items-end gap-2">
        <Textarea
          aria-label="Escribir mensaje"
          className="min-h-11 flex-1 resize-none"
          rows={2}
          placeholder={enabled ? "Escribí una respuesta…" : "Envío deshabilitado: integración de WhatsApp pendiente"}
          disabled={!enabled}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <Button type="submit" disabled={!enabled || busy || !body.trim()} aria-label="Enviar"><Send /></Button>
      </div>
      {error ? <p className="mt-1 text-xs text-st-busy">{error}</p> : null}
    </form>
  );
}

export function ConversationTools({ area, id, status, customerId, customers, unread }: { area: "tenant" | "gavia"; id: string; status: string; customerId: string | null; customers: { id: string; label: string }[]; unread: number }) {
  const router = useRouter();
  React.useEffect(() => {
    if (unread > 0) updateConversationAction({ area, id, markRead: true }).then(() => router.refresh());
  }, [area, id, unread, router]);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select aria-label="Estado de la conversación" className="h-8 w-36 text-xs" value={status} onChange={async (e) => { await updateConversationAction({ area, id, status: e.target.value }); router.refresh(); }}>
        <option value="abierta">Abierta</option>
        <option value="pendiente">Pendiente</option>
        <option value="cerrada">Cerrada</option>
      </Select>
      {area === "tenant" ? (
        <Select aria-label="Cliente asociado" className="h-8 w-48 text-xs" value={customerId ?? ""} onChange={async (e) => { await updateConversationAction({ area, id, customerId: e.target.value || null }); router.refresh(); }}>
          <option value="">Sin cliente asociado</option>
          {customers.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </Select>
      ) : null}
    </div>
  );
}
