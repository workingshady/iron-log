import { useEffect, useId, useRef, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ChevronRight, Dumbbell, X } from "lucide-react";
import { cx } from "../lib/util";

/** Bottom sheet on phones, centered dialog on desktop. The only popup style in the app. */
export function Sheet({ open, onClose, title, children, icon: Icon }: { open: boolean; onClose: () => void; title?: string; children: ReactNode; icon?: LucideIcon }) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, onClose]);
  // move focus into the sheet when it opens, give it back to the opener when it closes (keyboard + screen readers).
  // The opener is read during render: by the time effects run, an autoFocus input inside may already have focus.
  const opener = useRef<HTMLElement | null>(null);
  if (open && !opener.current && typeof document !== "undefined") opener.current = document.activeElement as HTMLElement | null;
  useEffect(() => {
    if (!open) return;
    if (!panel.current?.contains(document.activeElement)) panel.current?.focus({ preventScroll: true });
    return () => { const b = opener.current; opener.current = null; if (b && b.isConnected && !/^(INPUT|TEXTAREA|SELECT)$/.test(b.tagName)) b.focus?.({ preventScroll: true }); };
  }, [open]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center" role="dialog" aria-modal="true" aria-labelledby={title ? titleId : undefined}>
      <div className="absolute inset-0 bg-black/65" onClick={onClose} aria-hidden />
      <div ref={panel} tabIndex={-1} className="relative max-h-[88dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-card px-4 pb-6 pt-3 outline-none safe-b md:rounded-2xl md:px-6 md:pt-5">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line md:hidden" aria-hidden />
        {title && (
          <div className="mb-3 flex items-center gap-2">
            {Icon && <Icon size={20} className="text-mute" aria-hidden />}
            <h2 id={titleId} className="flex-1 text-lg font-semibold">{title}</h2>
            <button type="button" onClick={onClose} className="-my-1 -mr-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-mute hover:bg-card2 hover:text-ink" aria-label="Close"><X size={20} aria-hidden /></button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

/** Button. Labels never wrap (they shorten with …) and icons never shrink. `stack` = icon above a small label, for 3-4 buttons in a row on phones. */
export function Btn({ children, onClick, kind = "ghost", className, disabled, type = "button", icon: Icon, stack, label }: {
  children?: ReactNode; onClick?: () => void; kind?: "primary" | "ghost" | "danger" | "soft"; className?: string; disabled?: boolean; type?: "button" | "submit"; icon?: LucideIcon; stack?: boolean;
  /** Accessible name: required when the button shows only an icon. */
  label?: string;
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-xl font-semibold transition active:scale-[.98] disabled:opacity-40",
        stack ? "min-h-14 flex-col gap-1 px-1.5 py-2 text-xs" : "min-h-12 gap-2 px-4",
        kind === "primary" && "bg-acc text-acc-ink hover:brightness-105",
        kind === "ghost" && "border border-line text-ink hover:bg-card2",
        kind === "soft" && "bg-card2 text-ink hover:bg-card3",
        kind === "danger" && "border border-bad/40 text-bad hover:bg-bad/10",
        className,
      )}
    >
      {Icon && <Icon size={stack ? 19 : 18} className="shrink-0" aria-hidden />}
      {children != null && <span className="min-w-0 truncate">{children}</span>}
    </button>
  );
}

/** Single-select chips. Tap the selected one again to clear (when `clearable`). */
export function Chips<T extends string | number>({ options, value, onChange, clearable = true, small, tone = "acc" }: {
  options: { id: T; label: string; icon?: LucideIcon }[]; value: T | null | undefined; onChange: (v: T | null) => void; clearable?: boolean; small?: boolean; tone?: "acc" | "bad" | "vio";
}) {
  const on = { acc: "border-acc bg-acc text-acc-ink", bad: "border-bad bg-bad text-black", vio: "border-vio bg-vio text-black" }[tone];
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={String(o.id)}
          type="button"
          onClick={() => onChange(value === o.id && clearable ? null : o.id)}
          aria-pressed={value === o.id}
          className={cx("inline-flex items-center gap-1.5 rounded-full border px-3 num", small ? "min-h-10 min-w-10 justify-center text-sm" : "min-h-11", value === o.id ? `${on} font-semibold` : "border-line text-ink hover:bg-card2")}
        >
          {o.icon && <o.icon size={15} aria-hidden />}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export const scale = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => ({ id: from + i, label: String(from + i) }));

export function Label({ children, icon: Icon }: { children: ReactNode; icon?: LucideIcon }) {
  return (
    <div className="mb-1.5 mt-4 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-mute">
      {Icon && <Icon size={14} aria-hidden />}
      {children}
    </div>
  );
}

export function NumInput({ value, onChange, placeholder, className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <input
      inputMode="decimal"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value.replace(",", "."))}
      onFocus={(e) => e.target.select()}
      className={cx("min-h-12 min-w-0 rounded-xl bg-card2 px-2 text-center text-lg font-semibold num outline-none placeholder:text-faint focus:ring-2 focus:ring-acc", !/w-/.test(className ?? "") && "w-full", className)}
    />
  );
}

export function Empty({ children, icon: Icon }: { children: ReactNode; icon?: LucideIcon }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line py-12 text-center text-mute">
      {Icon && <Icon size={28} className="text-faint" aria-hidden />}
      <div className="max-w-xs text-sm">{children}</div>
    </div>
  );
}

/** Page title + one plain sentence saying what the page is for. */
export function PageHead({ icon: Icon, title, sub, right }: { icon: LucideIcon; title: string; sub: string; right?: ReactNode }) {
  return (
    <header className="mb-4 flex items-center gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-card2 text-ink" aria-hidden><Icon size={20} /></div>
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-2xl font-bold leading-tight">{title}</h1>
        <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-mute">{sub}</p>
      </div>
      {right}
    </header>
  );
}

export function Card({ children, className, title, icon: Icon, right }: { children: ReactNode; className?: string; title?: string; icon?: LucideIcon; right?: ReactNode }) {
  return (
    <section className={cx("rounded-2xl bg-card p-4", className)}>
      {title && (
        <div className="mb-3 flex min-h-6 items-center gap-2 text-sm font-semibold text-mute">
          {Icon && <Icon size={16} className="shrink-0" aria-hidden />}
          <h2 className="min-w-0 flex-1 truncate">{title}</h2>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({ icon: Icon, value, label, tone }: { icon: LucideIcon; value: ReactNode; label: string; tone?: "acc" | "warn" | "bad" | "vio" | "info" }) {
  const c = tone ? { acc: "text-acc", warn: "text-warn", bad: "text-bad", vio: "text-vio", info: "text-info" }[tone] : "text-mute";
  return (
    <div className="rounded-2xl bg-card p-4">
      <Icon size={18} className={c} aria-hidden />
      <div className="mt-2 text-2xl font-bold num">{value}</div>
      <div className="text-xs text-mute">{label}</div>
    </div>
  );
}

/** YouTube thumbnail (or a neutral icon tile) so exercises are recognisable at a glance. */
export function Thumb({ yt, className }: { yt?: string; className?: string }) {
  return (
    <div className={cx("relative shrink-0 overflow-hidden rounded-lg bg-card3", className ?? "h-11 w-16")}>
      {yt ? (
        <img src={`https://i.ytimg.com/vi/${yt}/mqdefault.jpg`} alt="" loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-faint"><Dumbbell size={18} /></div>
      )}
    </div>
  );
}

export function Badge({ children, tone = "mute" }: { children: ReactNode; tone?: "acc" | "warn" | "bad" | "mute" | "info" | "vio" }) {
  const c = { acc: "bg-acc/15 text-acc", warn: "bg-warn/15 text-warn", bad: "bg-bad/15 text-bad", mute: "bg-card2 text-mute", info: "bg-info/15 text-info", vio: "bg-vio/15 text-vio" }[tone];
  return <span className={cx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium", c)}>{children}</span>;
}

/** Small uppercase header above a group of cards or rows (Gestalt: one header per group). */
export function SectionHead({ children, right, className }: { children: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <div className={cx("mb-2 mt-6 flex min-h-6 items-center gap-2 px-1", className)}>
      <h2 className="flex-1 text-xs font-semibold uppercase tracking-wide text-mute">{children}</h2>
      {right}
    </div>
  );
}

/** "See all >" link for a card or section header, with a 44 px tap height that doesn't grow the header. */
export function MoreLink({ href, children, label }: { href: string; children: ReactNode; label?: string }) {
  return (
    <a href={href} aria-label={label} className="-my-3 inline-flex min-h-11 items-center gap-0.5 rounded-lg px-1 text-xs font-medium text-info hover:underline">
      {children}
      <ChevronRight size={14} aria-hidden />
    </a>
  );
}
