import { useEffect, type ReactNode } from "react";
import { cx } from "../lib/util";

/** Bottom sheet: the only popup style in the app. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal>
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-lg max-h-[88dvh] overflow-y-auto rounded-t-2xl bg-card border-t border-line px-4 pt-3 pb-6 safe-b">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" />
        {title && <h2 className="mb-3 text-lg font-semibold">{title}</h2>}
        {children}
      </div>
    </div>
  );
}

export function Btn({ children, onClick, kind = "ghost", className, disabled, type = "button" }: {
  children: ReactNode; onClick?: () => void; kind?: "primary" | "ghost" | "danger" | "soft"; className?: string; disabled?: boolean; type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={cx(
        "min-h-12 rounded-xl px-4 font-semibold active:scale-[.98] transition disabled:opacity-40",
        kind === "primary" && "bg-acc text-acc-ink",
        kind === "ghost" && "border border-line text-ink",
        kind === "soft" && "bg-card2 text-ink",
        kind === "danger" && "border border-bad/50 text-bad",
        className,
      )}
    >
      {children}
    </button>
  );
}

/** Single-select chips. Tap the selected one again to clear (when `clearable`). */
export function Chips<T extends string | number>({ options, value, onChange, clearable = true, small }: {
  options: { id: T; label: string }[]; value: T | null | undefined; onChange: (v: T | null) => void; clearable?: boolean; small?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={String(o.id)}
          type="button"
          onClick={() => onChange(value === o.id && clearable ? null : o.id)}
          className={cx(
            "rounded-full border px-3 num",
            small ? "min-h-9 text-sm" : "min-h-11",
            value === o.id ? "border-acc bg-acc text-acc-ink font-semibold" : "border-line text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export const scale = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => ({ id: from + i, label: String(from + i) }));

export function Label({ children }: { children: ReactNode }) {
  return <div className="mb-1.5 mt-4 text-xs font-medium uppercase tracking-wide text-mute">{children}</div>;
}

export function NumInput({ value, onChange, placeholder, className, step }: {
  value: string; onChange: (v: string) => void; placeholder?: string; className?: string; step?: string;
}) {
  return (
    <input
      inputMode="decimal"
      step={step}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value.replace(",", "."))}
      onFocus={(e) => e.target.select()}
      className={cx("min-h-12 w-full rounded-xl bg-card2 px-3 text-center text-lg font-semibold num outline-none focus:ring-2 focus:ring-acc placeholder:text-mute/60", className)}
    />
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-10 text-center text-mute">{children}</p>;
}
