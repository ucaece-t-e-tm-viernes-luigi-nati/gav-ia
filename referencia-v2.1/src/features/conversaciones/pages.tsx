import Link from "next/link";
import { MessageCircle, Search } from "lucide-react";
import { Alert, Badge, Card, DemoTag, EmptyState, PageHeader } from "@/components/ui/primitives";
import { requireModule, requireSuperadmin, type TenantRole } from "@/server/auth/context";
import { asUser, type Db } from "@/server/db";
import { getWhatsAppConfig } from "@/server/whatsapp";
import { formatDateTime } from "@/lib/dates";
import { cn, initials } from "@/lib/utils";
import { Composer, ConversationTools } from "./thread-client";

type Search = Promise<{ c?: string; q?: string; estado?: string }>;

async function load(db: Db, balnearioId: string | null, sp: Awaited<Search>) {
  const list = await db.many<{ id: string; contact_name: string; contact_phone: string; status: string; unread_count: number; last_message_at: string | null; is_demo: boolean; customer_name: string | null; preview: string | null }>(
    `select c.id, c.contact_name, c.contact_phone, c.status, c.unread_count, c.last_message_at, c.is_demo,
            trim(cu.first_name || ' ' || cu.last_name) as customer_name,
            (select body from messages m where m.conversation_id = c.id order by m.created_at desc limit 1) as preview
       from conversations c left join customers cu on cu.id = c.customer_id
      where c.balneario_id is not distinct from $1 and c.scope = $2
        and ($3::text is null or c.contact_name ilike '%' || $3 || '%' or c.contact_phone ilike '%' || $3 || '%')
        and ($4::text is null or c.status = $4)
      order by c.last_message_at desc nulls last limit 100`,
    [balnearioId, balnearioId ? "balneario" : "gavia", sp.q?.trim() || null, sp.estado || null],
  );
  const selectedId = sp.c && list.some((x) => x.id === sp.c) ? sp.c : list[0]?.id;
  const thread = selectedId
    ? await db.one<{ id: string; contact_name: string; contact_phone: string; status: string; unread_count: number; customer_id: string | null; reservation_id: string | null; reservation_number: number | null; lead_name: string | null; is_demo: boolean }>(
        `select c.id, c.contact_name, c.contact_phone, c.status, c.unread_count, c.customer_id, c.reservation_id, r.number as reservation_number, l.business_name as lead_name, c.is_demo
           from conversations c left join reservations r on r.id = c.reservation_id left join leads l on l.id = c.lead_id where c.id = $1`,
        [selectedId],
      )
    : null;
  const messages = selectedId
    ? await db.many<{ id: string; direction: string; body: string; status: string; created_at: string; is_demo: boolean; author: string | null }>(
        `select m.id, m.direction, m.body, m.status, m.created_at, m.is_demo, p.full_name as author from messages m left join profiles p on p.id = m.sent_by
          where m.conversation_id = $1 order by m.created_at`,
        [selectedId],
      )
    : [];
  const customers = balnearioId
    ? await db.many<{ id: string; label: string }>(`select id, trim(first_name || ' ' || last_name) as label from customers where balneario_id = $1 order by last_name limit 300`, [balnearioId])
    : [];
  return { list, thread, messages, customers };
}

async function ConversationsView({ area, userId, balnearioId, base, sp, eyebrow, panel }: { area: "tenant" | "gavia"; userId: string; balnearioId: string | null; base: string; sp: Awaited<Search>; eyebrow: string; panel: string }) {
  const [data, cfg] = await Promise.all([asUser(userId, (db) => load(db, balnearioId, sp)), getWhatsAppConfig(balnearioId)]);
  const { list, thread, messages, customers } = data;
  return (
    <>
      <PageHeader
        eyebrow={eyebrow}
        title={area === "gavia" ? "Conversaciones comerciales" : "Conversaciones de WhatsApp"}
        description={area === "gavia" ? "Conversaciones de GAVIA con prospectos y clientes comerciales. Separadas de las conversaciones de cada balneario." : "Conversaciones con los clientes del balneario."}
      />
      {!cfg ? (
        <Alert tone="warning" title="Integración de WhatsApp Business pendiente" className="mb-4">
          {area === "gavia"
            ? "Configurá WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ACCESS_TOKEN y WHATSAPP_APP_SECRET en el servidor para recibir y enviar mensajes."
            : "El dueño debe cargar las credenciales de WhatsApp Business en Configuración → Integraciones."}{" "}
          Mientras tanto, no se envían ni reciben mensajes; las conversaciones marcadas como “Demostración” son datos ficticios.
        </Alert>
      ) : null}
      <Card className="grid min-h-[560px] overflow-hidden md:grid-cols-[300px_1fr]">
        <div className="border-b border-line md:border-b-0 md:border-r">
          <form className="flex gap-2 border-b border-line p-3">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-mist" aria-hidden />
              <input name="q" defaultValue={sp.q} aria-label="Buscar contacto" placeholder="Buscar contacto" className="h-9 w-full rounded-lg border border-line pl-8 pr-2 text-sm" />
            </div>
            <select name="estado" defaultValue={sp.estado ?? ""} aria-label="Filtrar por estado" className="h-9 rounded-lg border border-line px-1 text-xs">
              <option value="">Todas</option><option value="abierta">Abiertas</option><option value="pendiente">Pendientes</option><option value="cerrada">Cerradas</option>
            </select>
          </form>
          <ul className="max-h-[500px] overflow-y-auto">
            {list.map((c) => (
              <li key={c.id}>
                <Link href={`${base}?c=${c.id}`} className={cn("flex gap-3 border-b border-line px-3 py-3 hover:bg-sand/40", thread?.id === c.id && "bg-foam/50")}>
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-navy text-xs font-bold text-white">{initials(c.contact_name || c.contact_phone)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold">{c.contact_name || c.contact_phone}</span>
                      {c.unread_count ? <span className="grid size-5 place-items-center rounded-full bg-sea text-[10px] font-bold text-white">{c.unread_count}</span> : null}
                    </span>
                    <span className="block truncate text-xs text-mist">{c.preview ?? "Sin mensajes"}</span>
                    <span className="mt-1 flex items-center gap-1 text-[10px] text-mist">{formatDateTime(c.last_message_at)} {c.is_demo ? <DemoTag /> : null}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {!list.length ? <EmptyState icon={MessageCircle} title="Sin conversaciones" description="Cuando la integración esté activa, los mensajes entrantes aparecerán acá." /> : null}
        </div>
        {thread ? (
          <div className="flex min-h-0 flex-col">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
              <div>
                <p className="font-bold text-navy">{thread.contact_name || thread.contact_phone} {thread.is_demo ? <DemoTag /> : null}</p>
                <p className="text-xs text-mist">
                  {thread.contact_phone}
                  {thread.customer_id ? <> · <Link className="text-sea hover:underline" href={`${panel}/clientes/${thread.customer_id}`}>Ver ficha</Link></> : null}
                  {thread.reservation_id ? <> · <Link className="text-sea hover:underline" href={`${panel}/reservas/${thread.reservation_id}`}>Reserva #{thread.reservation_number}</Link></> : null}
                  {thread.lead_name ? <> · Prospecto: {thread.lead_name}</> : null}
                </p>
              </div>
              <ConversationTools area={area} id={thread.id} status={thread.status} customerId={thread.customer_id} customers={customers} unread={thread.unread_count} />
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto bg-[#fbfaf6] p-4">
              {messages.map((m) => (
                <div key={m.id} className={cn("flex", m.direction === "saliente" ? "justify-end" : "justify-start")}>
                  <div className={cn("max-w-[75%] rounded-2xl px-3 py-2 text-sm shadow-sm", m.direction === "saliente" ? "rounded-br-sm bg-navy text-white" : "rounded-bl-sm bg-white")}>
                    <p className="sr-only">{m.direction === "saliente" ? "Mensaje enviado" : "Mensaje recibido"}</p>
                    <p className="whitespace-pre-wrap">{m.body}</p>
                    <p className={cn("mt-1 text-[10px]", m.direction === "saliente" ? "text-foam/70" : "text-mist")}>
                      {m.direction === "entrante" ? "Entrante" : `Saliente${m.author ? ` · ${m.author}` : ""}`} · {formatDateTime(m.created_at)} · {m.status}
                      {m.is_demo ? " · demostración" : ""}
                    </p>
                  </div>
                </div>
              ))}
              {!messages.length ? <p className="text-center text-sm text-mist">Sin mensajes.</p> : null}
            </div>
            <Composer area={area} conversationId={thread.id} enabled={!!cfg} />
          </div>
        ) : (
          <div className="grid place-items-center p-8 text-sm text-mist">Seleccioná una conversación.</div>
        )}
      </Card>
      <p className="mt-2 text-xs text-mist">Estados: <Badge tone="info">abierta</Badge> <Badge tone="warning">pendiente</Badge> <Badge tone="muted">cerrada</Badge></p>
    </>
  );
}

export async function TenantConversationsPage({ role, searchParams }: { role: TenantRole; searchParams: Search }) {
  const t = await requireModule(role, "whatsapp");
  return <ConversationsView area="tenant" userId={t.viewer.id} balnearioId={t.balnearioId} base={`/${role}/conversaciones`} panel={`/${role}`} sp={await searchParams} eyebrow={t.balnearioName} />;
}

export async function GaviaConversationsPage({ searchParams }: { searchParams: Search }) {
  const v = await requireSuperadmin("conversaciones");
  return <ConversationsView area="gavia" userId={v.id} balnearioId={null} base="/backoffice/conversaciones" panel="/backoffice" sp={await searchParams} eyebrow="GAVIA" />;
}
