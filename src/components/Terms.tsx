import { useState } from "react";
import { Info } from "lucide-react";
import { termsIn, type Term } from "../../program/learn";
import { Sheet } from "./ui";

/** Technique text with a ⓘ that explains any term in it (drop set, RIR, rest-pause…). */
export function TechNote({ text, extra = [] }: { text?: string; extra?: string[] }) {
  const [open, setOpen] = useState(false);
  const terms = termsIn([text, ...extra].filter(Boolean).join(" "));
  if (!text && !terms.length) return null;
  return (
    <>
      <button onClick={() => terms.length && setOpen(true)} className="inline-flex items-center gap-1 text-left text-xs text-warn">
        {text}
        {terms.length > 0 && <Info size={13} className="shrink-0 text-info" />}
      </button>
      <TermSheet open={open} onClose={() => setOpen(false)} terms={terms} />
    </>
  );
}

export function TermSheet({ open, onClose, terms }: { open: boolean; onClose: () => void; terms: Term[] }) {
  return (
    <Sheet open={open} onClose={onClose} title="What this means" icon={Info}>
      <div className="space-y-3">
        {terms.map((t) => (
          <div key={t.key} className="rounded-xl bg-card2 p-3">
            <div className="font-semibold">{t.name}</div>
            <p className="mt-1 text-sm">{t.short}</p>
            {t.how && <p className="mt-1 text-sm text-mute">{t.how}</p>}
          </div>
        ))}
      </div>
    </Sheet>
  );
}

/** Small ⓘ button for a known term key. */
export function InfoDot({ term }: { term: Term }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} className="inline-flex h-7 w-7 items-center justify-center rounded-full text-info" aria-label={`What is ${term.name}`}>
        <Info size={15} />
      </button>
      <TermSheet open={open} onClose={() => setOpen(false)} terms={[term]} />
    </>
  );
}
