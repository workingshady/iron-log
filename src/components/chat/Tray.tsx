import { useMemo, useState } from "react";
import { Clock, Search, Smile, Sticker as StickerIcon } from "lucide-react";
import { cx } from "../../lib/util";
import { EMOJI_CATS, pushRecent, recentEmoji, searchEmoji } from "./emoji";
import { STICKERS, Sticker } from "./stickers";

/** Emoji picker: recents, categories, search by name. 8 columns × 44 px targets. */
export function EmojiPicker({ onPick, autoFocus }: { onPick: (e: string) => void; autoFocus?: boolean }) {
  const recents = useMemo(recentEmoji, []);
  const [cat, setCat] = useState(recents.length ? "recent" : EMOJI_CATS[0].id);
  const [q, setQ] = useState("");
  const found = useMemo(() => searchEmoji(q), [q]);
  const items = q ? found.map((x) => ({ e: x.e, n: x.n })) : cat === "recent" ? recents.map((e) => ({ e, n: "recent" })) : EMOJI_CATS.find((c) => c.id === cat)!.items;
  const pick = (e: string) => { pushRecent(e); onPick(e); };
  return (
    <div className="flex h-full min-h-0 flex-col">
      <label className="relative mx-2 mb-1.5 mt-2 block">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" aria-hidden />
        <span className="sr-only">Search emoji</span>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search emoji (fire, flex, love…)" autoFocus={autoFocus}
          className="h-10 w-full rounded-xl bg-card2 pl-9 pr-3 text-[15px] placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-acc/60" />
      </label>
      {!q && (
        <div role="tablist" aria-label="Emoji categories" className="flex shrink-0 gap-0.5 overflow-x-auto px-1.5 pb-1">
          {[{ id: "recent", label: "Recent", icon: "" }, ...EMOJI_CATS].map((c) => (
            <button key={c.id} type="button" role="tab" aria-selected={cat === c.id} aria-label={c.label} title={c.label} onClick={() => setCat(c.id)}
              className={cx("flex h-10 min-w-10 shrink-0 items-center justify-center rounded-lg text-xl", cat === c.id ? "bg-card3" : "opacity-70 hover:bg-card2")}>
              {c.id === "recent" ? <Clock size={18} aria-hidden className="text-mute" /> : c.icon}
            </button>
          ))}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2" role="listbox" aria-label={q ? "Search results" : "Emoji"}>
        {items.length ? (
          <div className="grid grid-cols-8">
            {items.map((x) => (
              <button key={x.e} type="button" role="option" aria-selected={false} aria-label={x.n.split(" ")[0]} title={x.n.split(" ").slice(0, 3).join(" ")} onClick={() => pick(x.e)}
                className="flex h-11 items-center justify-center rounded-lg text-[26px] leading-none hover:bg-card2 active:scale-90 motion-reduce:active:scale-100">
                {x.e}
              </button>
            ))}
          </div>
        ) : (
          <p className="px-3 py-6 text-center text-sm text-mute">{q ? "No emoji found" : "Emoji you use show up here"}</p>
        )}
      </div>
    </div>
  );
}

export function StickerPicker({ onPick }: { onPick: (id: string) => void }) {
  return (
    <div className="grid h-full grid-cols-4 content-start gap-1 overflow-y-auto p-2" role="listbox" aria-label="Stickers">
      {STICKERS.map((s) => (
        <button key={s.id} type="button" role="option" aria-selected={false} aria-label={s.label} title={s.label} onClick={() => onPick(s.id)}
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
    <div className="flex h-[min(320px,42dvh)] flex-col border-t border-line bg-card">
      <div className="min-h-0 flex-1">{tab === "emoji" ? <EmojiPicker onPick={onEmoji} /> : <StickerPicker onPick={onSticker} />}</div>
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
