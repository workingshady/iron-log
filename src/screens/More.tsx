import { ChevronRight, LayoutGrid } from "lucide-react";
import { moreGroups } from "../nav";
import { PageHead, SectionHead } from "../components/ui";
import { Avatar } from "../components/Avatar";
import { useMe } from "../lib/me";

const TONE = { info: "text-info", vio: "text-vio", warn: "text-warn" } as const;

/** Grouped list (one card per section, rows split by hairlines): scannable, 64 px rows, one line of help each. */
export default function More() {
  const me = useMe();
  return (
    <div>
      <PageHead icon={LayoutGrid} title="More" sub="Daily tracking, extras, library and settings" />
      <a href="#/profile" className="flex min-h-20 items-center gap-3 rounded-2xl bg-card px-4 py-3 hover:bg-card2 active:bg-card2">
        <Avatar id={me?.avatarId} name={me?.name ?? me?.username} size={52} ring={!!me?.avatarId} />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{me?.name || me?.username || "Your profile"}</span>
          <span className="block truncate text-xs text-mute">{me ? `@${me.username} · ` : ""}photos, progress, bio</span>
        </span>
        <ChevronRight size={18} className="shrink-0 text-faint" aria-hidden />
      </a>
      {moreGroups(me?.role).map((g, gi) => (
        <section key={g.id} aria-labelledby={`more-${g.id}`}>
          <SectionHead className={gi === 0 ? "mt-2" : undefined}><span id={`more-${g.id}`}>{g.label}</span></SectionHead>
          <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-card">
            {g.items.map((m) => (
              <li key={m.path}>
                <a href={`#${m.path}`} className="flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-card2 active:bg-card2">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-card2" aria-hidden>
                    <m.icon size={20} className={m.tone ? TONE[m.tone] : "text-ink"} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{m.label}</span>
                    <span className="block truncate text-xs text-mute">{m.sub}</span>
                  </span>
                  <ChevronRight size={18} className="shrink-0 text-faint" aria-hidden />
                </a>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
