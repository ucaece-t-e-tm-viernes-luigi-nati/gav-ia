"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

function Overlay() {
  return <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-navy-900/30 backdrop-blur-[2px] data-[state=open]:animate-[fade-up_.2s_ease-out]" />;
}

export function DialogContent({ title, description, children, className }: { title: string; description?: string; children: React.ReactNode; className?: string }) {
  return (
    <DialogPrimitive.Portal>
      <Overlay />
      <DialogPrimitive.Content
        className={cn(
          "fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-line bg-white p-6 shadow-xl",
          className,
        )}
      >
        <DialogPrimitive.Title className="pr-8 text-lg font-bold text-navy">{title}</DialogPrimitive.Title>
        {description ? <DialogPrimitive.Description className="mt-1 text-sm text-mist">{description}</DialogPrimitive.Description> : <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>}
        <div className="mt-5">{children}</div>
        <DialogPrimitive.Close className="absolute right-4 top-4 rounded-md p-1 text-mist hover:bg-sand" aria-label="Cerrar">
          <X className="size-4" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

/** Panel lateral (ficha) basado en Dialog. */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <Overlay />
        <DialogPrimitive.Content className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-line bg-white shadow-2xl data-[state=open]:animate-[slide-in_.25s_ease-out]">
          <style>{`@keyframes slide-in{from{transform:translateX(24px);opacity:.4}to{transform:none;opacity:1}}`}</style>
          <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div>
              <DialogPrimitive.Title className="text-lg font-bold text-navy">{title}</DialogPrimitive.Title>
              {description ? <DialogPrimitive.Description asChild><div className="mt-1 text-sm text-mist">{description}</div></DialogPrimitive.Description> : <DialogPrimitive.Description className="sr-only">Detalle</DialogPrimitive.Description>}
            </div>
            <DialogPrimitive.Close className="rounded-md p-1 text-mist hover:bg-sand" aria-label="Cerrar">
              <X className="size-5" />
            </DialogPrimitive.Close>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer ? <div className="border-t border-line bg-sand/30 px-5 py-3">{footer}</div> : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** Botón que pide confirmación antes de ejecutar una acción importante. */
export function ConfirmButton({
  trigger,
  title,
  description,
  confirmLabel = "Confirmar",
  tone = "danger",
  onConfirm,
  children,
}: {
  trigger: React.ReactNode;
  title: string;
  description?: string;
  confirmLabel?: string;
  tone?: "danger" | "primary";
  onConfirm: () => Promise<boolean | void> | boolean | void;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent title={title} description={description}>
        {children}
        <div className="mt-5 flex justify-end gap-2">
          <DialogClose asChild>
            <Button variant="outline">Volver</Button>
          </DialogClose>
          <Button
            variant={tone}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const keep = await onConfirm();
              setBusy(false);
              if (keep !== false) setOpen(false);
            }}
          >
            {busy ? "Procesando…" : confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
