import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Clock, Search, Smile, Sticker as StickerIcon } from "lucide-react";
import { cx } from "../../lib/util";
import { EMOJI_CATS, getTone, pushRecent, recentEmoji, saveTone, searchEmoji, TONES, withTone } from "./emoji";
import { STICKERS, Sticker } from "./stickers";

const CELL = 44;

/** Number of columns that fit (each cell ≥ 44 px). */
function useCols(ref: React.RefObject<HTMLElement | null>, min = 6, max = 10) {
  const [cols, setCols] = useState(8);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const f = () => setCols(Math.max(min, Math.min(max, Math.floor(el.clientWidth / CELL) || 8)));
    f();
    const ro = new ResizeObserver(f);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, min, max]);
  return cols;
}

/**
 * Emoji picker: search (English + Arabic keywords), recents, categories, skin tone.
 * The emoji are an ARIA grid with one tab stop (roving tabindex): arrows move, Home/End = row start/end,
 * Ctrl+Home/End = first/last, PageUp/PageDown = 4 rows, Enter/Space picks, ArrowDown from the search box enters the grid.
 */
export function EmojiPicker({ onPick, autoFocus, label = "Emoji" }: { onPick: (e: string) => void; autoFocus?: boolean; label?: string }) {
  const recents = useMemo(recentEmoji, []);
  const [cat, setCat] = useState(recents.length ? "recent" : EMOJI_CATS[0].id);
  const [q, setQ] = useState("");
  const [tone, setTone] = useState(getTone);
  const [tonesOpen, setTonesOpen] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const cols = useCols(box);
  const found = useMemo(() => searchEmoji(q), [q]);
  const items = useMemo(() => {
    const base = q ? found.map((x) => ({ e: x.e, n: x.n })) : cat === "recent" ? recents.map((e) => ({ e, n: "recent" })) : EMOJI_CATS.find((c) => c.id === cat)!.items;
    return base.map((x) => ({ e: cat === "recent" && !q ? x.e : withTone(x.e, tone), n: x.n }));
  }, [q, found, cat, recents, tone]);
  useEffect(() => setActive(0), [q, cat]);
  const pick = (e: string) => { pushRecent(e); onPick(e); };
  const rows: (typeof items)[] = [];
  for (let i = 0; i < items.length; i += cols) rows.push(items.slice(i, i + cols));

  const focusCell = (i: number) => {
    const n = Math.max(0, Math.min(items.length - 1, i));
    setActive(n);
    requestAnimationFrame(() => grid.current?.querySelector<HTMLElement>(`[data-i="${n}"]`)?.focus());
  };
  const onGridKey = (e: React.KeyboardEvent) => {
    const i = active, row = Math.floor(i / cols);
    const k = e.key;
    let n: number | null = null;
    if (k === "ArrowRight") n = i + 1;
    else if (k === "ArrowLeft") n = i - 1;
    else if (k === "ArrowDown") n = i + cols < items.length ? i + cols : i;
    else if (k === "ArrowUp") { if (i - cols < 0) { e.preventDefault(); box.current?.querySelector<HTMLInputElement>("input")?.focus(); return; } n = i - cols; }
    else if (k === "Home") n = e.ctrlKey ? 0 : row * cols;
    else if (k === "End") n = e.ctrlKey ? items.length - 1 : Math.min(items.length - 1, row * cols + cols - 1);
    else if (k === "PageDown") n = Math.min(items.length - 1, i + cols * 4);
    else if (k === "PageUp") n = Math.max(0, i - cols * 4);
    if (n !== null) { e.preventDefault(); focusCell(n); }
  };

  return (
    <div ref={box} className="flex h-full min-h-0 flex-col">
      <div className="mx-2 mb-1.5 mt-2 flex items-center gap-1.5">
        <label className="relative block min-w-0 flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" aria-hidden />
          <span className="sr-only">Search emoji (English or Arabic)</span>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search emoji · ابحث" autoFocus={autoFocus} dir="auto"
            onKeyDown={(e) => { if (e.key === "ArrowDown" && items.length) { e.preventDefault(); focusCell(0); } if (e.key === "Enter" && q && items[0]) { e.preventDefault(); pick(items[0].e); } }}
            className="h-11 w-full rounded-xl bg-card2 pl-9 pr-3 text-[15px] placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-acc/60" />
        </label>
        <div className="relative">
          <button type="button" onClick={() => setTonesOpen((o) => !o)} aria-expanded={tonesOpen} aria-label={`Skin tone: ${TONES[tone].label}`}
            className="flex h-11 w-11 items-center justify-center rounded-xl text-[22px] hover:bg-card2">{withTone("✋", tone)}</button>
          {tonesOpen && (
            <div role="radiogroup" aria-label="Skin tone" className="absolute right-0 top-12 z-10 flex gap-0.5 rounded-xl border border-line bg-card3 p-1 shadow-xl"
              onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); setTonesOpen(false); } }}>
              {TONES.map((t) => (
                <button key={t.id} type="button" role="radio" aria-checked={tone === t.id} aria-label={t.label} autoFocus={tone === t.id}
                  onClick={() => { setTone(t.id); saveTone(t.id); setTonesOpen(false); }}
                  className={cx("flex h-11 w-11 items-center justify-center rounded-lg text-[22px]", tone === t.id ? "bg-card2 ring-2 ring-acc/70" : "hover:bg-card2")}>
                  {withTone("✋", t.id)}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      {!q && (
        <div role="tablist" aria-label="Emoji categories" className="flex shrink-0 gap-0.5 overflow-x-auto px-1.5 pb-1"
          onKeyDown={(e) => {
            const ids = ["recent", ...EMOJI_CATS.map((c) => c.id)];
            const i = ids.indexOf(cat);
            const n = e.key === "ArrowRight" ? (i + 1) % ids.length : e.key === "ArrowLeft" ? (i - 1 + ids.length) % ids.length : -1;
            if (n < 0) return;
            e.preventDefault();
            setCat(ids[n]);
            requestAnimationFrame(() => (e.currentTarget as HTMLElement | null)?.querySelector<HTMLElement>(`[data-cat="${ids[n]}"]`)?.focus());
          }}>
          {[{ id: "recent", label: "Recent", icon: "" }, ...EMOJI_CATS].map((c) => (
            <button key={c.id} data-cat={c.id} type="button" role="tab" aria-selected={cat === c.id} tabIndex={cat === c.id ? 0 : -1} aria-label={c.label} title={c.label} onClick={() => setCat(c.id)}
              className={cx("flex h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-xl", cat === c.id ? "bg-card3" : "opacity-70 hover:bg-card2")}>
              {c.id === "recent" ? <Clock size={18} aria-hidden className="text-mute" /> : c.icon}
            </button>
          ))}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-1.5 pb-2">
        {items.length ? (
          <div ref={grid} role="grid" aria-label={q ? `${items.length} results for ${q}` : label} onKeyDown={onGridKey}>
            {rows.map((r, ri) => (
              <div key={ri} role="row" className="grid" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
                {r.map((x, ci) => {
                  const i = ri * cols + ci;
                  const name = x.n === "recent" ? "recently used" : x.n.split(" ").filter((w) => /^[a-z]/.test(w)).slice(0, 3).join(" ");
                  return (
                    <button key={x.e + i} type="button" role="gridcell" data-i={i} tabIndex={i === active ? 0 : -1} aria-label={`${x.e} ${name}`} title={name}
                      onFocus={() => setActive(i)} onClick={() => pick(x.e)}
                      className="flex h-11 items-center justify-center rounded-lg text-[26px] leading-none hover:bg-card2 focus-visible:bg-card3 active:scale-90 motion-reduce:active:scale-100">
                      {x.e}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        ) : (
          <p className="px-3 py-6 text-center text-sm text-mute" role="status">{q ? "No emoji found" : "Emoji you use show up here"}</p>
        )}
      </div>
    </div>
  );
}

export function StickerPicker({ onPick }: { onPick: (id: string) => void }) {
  return (
    <div className="grid h-full grid-cols-4 content-start gap-1 overflow-y-auto p-2" role="list" aria-label="Stickers">
      {STICKERS.map((s) => (
        <button key={s.id} type="button" role="listitem" aria-label={`Send sticker: ${s.label}`} title={s.label} onClick={() => onPick(s.id)}
          className="flex aspect-square items-center justify-center rounded-xl p-1 hover:bg-card2 active:scale-95 motion-reduce:active:scale-100">
          <Sticker id={s.id} size={76} />
        </button>
      ))}
    </div>
  );
}

/** The panel under the composer: Emoji | Stickers. */
export function Tray({ onEmoji, onSticker }: { onEmoji: (e: string) => void; onSticker: (id: string) => void }) {
  const [tab, setTab] = useState<"emoji" | "sticker">("emoji");
  return (
    <div className="flex h-[min(320px,42dvh)] flex-col border-t border-line bg-card" role="region" aria-label="Emoji and stickers">
      <div className="min-h-0 flex-1" role="tabpanel">{tab === "emoji" ? <EmojiPicker onPick={onEmoji} /> : <StickerPicker onPick={onSticker} />}</div>
      <div role="tablist" aria-label="Emoji or stickers" className="flex shrink-0 justify-center gap-2 border-t border-line py-1">
        {([["emoji", "Emoji", Smile], ["sticker", "Stickers", StickerIcon]] as const).map(([id, label, Icon]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
            className={cx("flex min-h-11 items-center gap-1.5 rounded-full px-4 text-sm font-semibold", tab === id ? "bg-card3 text-ink" : "text-mute hover:bg-card2")}>
            <Icon size={18} aria-hidden /> {label}
          </button>
        ))}
      </div>
    </div>
  );
}
