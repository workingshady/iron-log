import { useState } from "react";
import { Dumbbell, Layers, Trophy } from "lucide-react";
import type { Post, PrSummary, WorkoutSummary } from "../../../shared/social";
import { Sheet } from "../ui";
import { PostCard } from "./PostCard";
import { kgShort, socialPhotoUrl } from "./lib";

/** Instagram-style 3-column grid of posts. Workouts / PRs / text get a designed tile instead of a photo. Tap → the post. */
export function PostGrid({ posts, onChange }: { posts: Post[]; onChange?: (p: Post[]) => void }) {
  const [open, setOpen] = useState<Post | null>(null);
  return (
    <>
      <ul className="grid grid-cols-3 gap-0.5" aria-label="Posts">
        {posts.map((p) => (
          <li key={p.id}>
            <button type="button" onClick={() => setOpen(p)} className="group relative block aspect-[4/5] w-full overflow-hidden bg-card text-left" aria-label={label(p)}>
              <Tile p={p} />
              {p.photoIds.length > 1 && <Layers size={15} className="absolute right-1.5 top-1.5 text-white drop-shadow" aria-hidden />}
            </button>
          </li>
        ))}
      </ul>
      {open && (
        <Sheet open onClose={() => setOpen(null)}>
          <div className="-mx-4 md:-mx-6">
            <PostCard post={open} onChange={(n) => { setOpen(n); onChange?.(posts.map((x) => (x.id === n.id ? n : x))); }} onDelete={(id) => { setOpen(null); onChange?.(posts.filter((x) => x.id !== id)); }} />
          </div>
        </Sheet>
      )}
    </>
  );
}

const label = (p: Post) => p.kind === "workout" ? `Workout: ${(p.data as WorkoutSummary | null)?.dayName ?? ""}` : p.kind === "pr" ? `PR: ${(p.data as PrSummary | null)?.name ?? ""}` : p.text?.slice(0, 60) || `${p.kind} post`;

function Tile({ p }: { p: Post }) {
  if (p.photoIds.length) return <img src={socialPhotoUrl(p.photoIds[0], true)} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover transition group-hover:opacity-90" />;
  if (p.kind === "workout" && p.data) {
    const w = p.data as WorkoutSummary;
    return (
      <span className="flex h-full flex-col justify-between bg-gradient-to-br from-acc/25 via-card2 to-card p-2">
        <Dumbbell size={16} className="text-acc" aria-hidden />
        <span><span className="block text-sm font-extrabold leading-tight">{w.dayName}</span><span className="block text-[11px] text-mute num">{w.minutes ? `${w.minutes} min · ` : ""}{kgShort(w.volume)}</span></span>
      </span>
    );
  }
  if (p.kind === "pr" && p.data) {
    const pr = p.data as PrSummary;
    return (
      <span className="flex h-full flex-col justify-between bg-gradient-to-br from-warn/30 via-card2 to-card p-2">
        <Trophy size={16} className="text-warn" aria-hidden />
        <span><span className="block truncate text-[11px] text-mute">{pr.name}</span><span className="block text-base font-extrabold leading-tight num">{pr.kg ? `${pr.kg}` : ""}{pr.reps ? `×${pr.reps}` : ""}</span></span>
      </span>
    );
  }
  return <span dir="auto" className="bidi line-clamp-6 h-full bg-card2 p-2 text-xs leading-snug">{p.text}</span>;
}
