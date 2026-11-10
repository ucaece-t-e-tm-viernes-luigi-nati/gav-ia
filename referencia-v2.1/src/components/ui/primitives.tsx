import * as React from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-xl border border-line bg-white shadow-[0_1px_2px_rgb(18_59_93/0.04)]", className)} {...props} />;
}

export function CardHeader({ title, description, action, className }: { title: React.ReactNode; description?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-start justify-between gap-4 border-b border-line px-5 py-4", className)}>
      <div>
        <h2 className="text-sm font-bold text-navy">{title}</h2>
        {description ? <p className="mt-0.5 text-xs text-mist">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function CardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5", className)} {...props} />;
}

const tones = {
  neutral: "bg-sand text-ink border-sand-200",
  info: "bg-foam text-navy border-[#c4e2f4]",
  success: "bg-st-free-bg text-[#1f7a50] border-[#cbeedb]",
  warning: "bg-st-held-bg text-[#8a5f0c] border-[#f6e2b4]",
  danger: "bg-st-busy-bg text-[#9b2f2c] border-[#f3cfcd]",
  muted: "bg-st-off-bg text-[#5a666d] border-line",
} as const;
export type Tone = keyof typeof tones;

export function Badge({ tone = "neutral", className, ...props }: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold leading-4", tones[tone], className)}
      {...props}
    />
  );
}

const alertIcons: Record<string, LucideIcon> = { info: Info, success: CheckCircle2, warning: AlertTriangle, danger: XCircle };

export function Alert({ tone = "info", title, children, className }: { tone?: "info" | "success" | "warning" | "danger"; title?: string; children?: React.ReactNode; className?: string }) {
  const Icon = alertIcons[tone];
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("flex gap-3 rounded-lg border p-3 text-sm", tones[tone], className)}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="space-y-0.5">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className="text-[13px] leading-relaxed opacity-90">{children}</div> : null}
      </div>
    </div>
  );
}

export function PageHeader({ title, description, actions, eyebrow }: { title: string; description?: React.ReactNode; actions?: React.ReactNode; eyebrow?: string }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow ? <p className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-sea">{eyebrow}</p> : null}
        <h1 className="text-2xl font-extrabold tracking-tight text-navy">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-sm text-mist">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, description, action }: { icon: LucideIcon; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <div className="mb-1 grid size-11 place-items-center rounded-full bg-foam text-sea">
        <Icon className="size-5" aria-hidden />
      </div>
      <p className="text-sm font-semibold text-navy">{title}</p>
      {description ? <p className="max-w-sm text-sm text-mist">{description}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

export function Stat({ label, value, hint, icon: Icon, tone = "navy" }: { label: string; value: React.ReactNode; hint?: React.ReactNode; icon?: LucideIcon; tone?: "navy" | "sea" | "free" | "held" | "busy" }) {
  const toneCls = { navy: "text-navy bg-foam", sea: "text-sea bg-foam", free: "text-st-free bg-st-free-bg", held: "text-st-held bg-st-held-bg", busy: "text-st-busy bg-st-busy-bg" }[tone];
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-mist">{label}</p>
        {Icon ? (
          <span className={cn("grid size-8 place-items-center rounded-lg", toneCls)}>
            <Icon className="size-4" aria-hidden />
          </span>
        ) : null}
      </div>
      <p className="mt-2 text-2xl font-extrabold tracking-tight text-navy tabular-nums">{value}</p>
      {hint ? <p className="mt-1 text-xs text-mist">{hint}</p> : null}
    </Card>
  );
}

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn("w-full text-left text-sm", className)} {...props} />
    </div>
  );
}
export function Th({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={cn("whitespace-nowrap border-b border-line bg-sand/40 px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-mist", className)} {...props} />;
}
export function Td({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("border-b border-line px-4 py-3 align-middle", className)} {...props} />;
}

export function DemoTag() {
  return <Badge tone="warning">Demostración</Badge>;
}
