import { cn } from "@/lib/utils";

/** Isotipo GAVIA: ave en vuelo sobre la línea de costa. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={cn("size-8", className)} aria-hidden>
      <rect width="40" height="40" rx="10" fill="#123B5D" />
      <path d="M8 19c3.2-4.6 7.4-5.2 12 0 4.6-5.2 8.8-4.6 12 0" fill="none" stroke="#DCEFFA" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 28.5c2.2 1.5 4.4 1.5 6.6 0s4.4-1.5 6.6 0 4.4 1.5 6.6 0 3.3-1.1 4.2-.6" fill="none" stroke="#2878A8" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ className, light }: { className?: string; light?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark />
      <span className={cn("text-[17px] font-extrabold tracking-tight", light ? "text-white" : "text-navy")}>
        GAVIA<span className={cn("ml-1 font-semibold", light ? "text-foam/80" : "text-sea")}>ERP</span>
      </span>
    </span>
  );
}
