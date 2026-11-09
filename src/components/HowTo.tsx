import { useState } from "react";
import type { PlanItem } from "../../shared/api";
import { Sheet } from "./ui";

/** Muscles + form cues + YouTube (embed loads only when tapped). */
export function HowTo({ item, open, onClose }: { item: PlanItem; open: boolean; onClose: () => void }) {
  const [play, setPlay] = useState<string | null>(null);
  const q = encodeURIComponent(`${item.name} proper form tutorial`);
  return (
    <Sheet open={open} onClose={() => { setPlay(null); onClose(); }} title={item.name}>
      <p className="text-sm text-mute">{item.muscles}</p>
      <ul className="mt-3 space-y-1.5">
        {item.cues.map((c) => (
          <li key={c} className="flex gap-2"><span className="text-acc">•</span>{c}</li>
        ))}
      </ul>
      <div className="mt-4 space-y-3">
        {item.yt.map((id, i) =>
          play === id ? (
            <div key={id} className="aspect-video overflow-hidden rounded-xl bg-black">
              <iframe
                className="h-full w-full"
                src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&playsinline=1`}
                title={item.name}
                allow="autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
              />
            </div>
          ) : (
            <button key={id} onClick={() => setPlay(id)} className="relative block aspect-video w-full overflow-hidden rounded-xl bg-black">
              <img src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`} alt="" loading="lazy" className="h-full w-full object-cover opacity-80" />
              <span className="absolute inset-0 m-auto flex h-14 w-14 items-center justify-center rounded-full bg-black/70 text-2xl">▶</span>
              {item.yt.length > 1 && <span className="absolute left-2 top-2 rounded bg-black/70 px-2 text-xs">{i + 1}/{item.yt.length}</span>}
            </button>
          ),
        )}
        <a href={`https://www.youtube.com/results?search_query=${q}`} target="_blank" rel="noreferrer" className="block rounded-xl border border-line py-3 text-center text-sm">
          Search YouTube{item.yt.length ? " for another video" : ""}
        </a>
      </div>
    </Sheet>
  );
}
