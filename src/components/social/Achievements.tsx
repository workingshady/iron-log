import { useState } from "react";
import { Dumbbell, Flame, HeartPulse, Lock, Star, Trophy, Weight, type LucideIcon } from "lucide-react";
import type { Badge, BadgeIcon, WeekDay } from "../../../shared/social";
import { cx } from "../../lib/util";
import { Sheet } from "../ui";
import { fmtNum } from "./lib";
import { MEDAL, Ring } from "./viz";

export const BADGE_ICON: Record<BadgeIcon, LucideIcon> = { dumbbell: Dumbbell, trophy: Trophy, flame: Flame, weight: Weight, heart: HeartPulse, star: Star };
const TIER = ["Bronze", "Silver", "Gold"];

/**
 * Story-highlight style row of achievements: earned first (newest tiers), then the next one you're closest to as a
 * progress ring (Duolingo-style "almost there" pull). Tap → all badges.
 */
export function BadgeRow({ badges, mine }: { badges: Badge[]; mine?: boolean }) {
  const [open, setOpen] = useState(false);
  const earned = badges.filter((b) => b.earned).sort((a, z) => z.tier - a.tier);
  const next = mine ? badges.filter((b) => !b.earned).sort((a, z) => z.value / z.target - a.value / a.target).slice(0, 2) : [];
  const shown = [...earned.slice(0, 8), ...next];
  if (!shown.length) return null;
  return (
    <>
      <ul className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none]" aria-label="Achievements">
        {shown.map((b) => (
          <li key={b.id} className="shrink-0">
            <button type="button" onClick={() => setOpen(true)} className="flex w-[68px] flex-col items-center gap-1 rounded-xl text-center" aria-label={`${b.label}${b.earned ? `, ${TIER[b.tier - 1]}` : `, ${b.value} of ${b.target}`}`}>
              <BadgeMedal b={b} size={60} />
              <span className="line-clamp-2 text-[11px] leading-tight text-mute">{b.label}</span>
            </button>
          </li>
        ))}
      </ul>
      {open && <BadgeSheet badges={badges} mine={mine} onClose={() => setOpen(false)} />}
    </>
  );
}

export function BadgeMedal({ b, size = 56 }: { b: Badge; size?: number }) {
  const Icon = BADGE_ICON[b.icon];
  const tint = MEDAL[3 - b.tier] ?? MEDAL[2]; // tier 3 → gold, 2 → silver, 1 → bronze
  if (!b.earned) {
    return (
      <Ring value={b.value} max={b.target} size={size} stroke={3} color="var(--color-acc)">
        <span className="flex items-center justify-center rounded-full bg-card2 text-faint" style={{ width: size - 10, height: size - 10 }}><Icon size={size * 0.36} aria-hidden /></span>
      </Ring>
    );
  }
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center rounded-full p-[3px]" style={{ width: size, height: size, background: `conic-gradient(from 200deg, ${tint}, color-mix(in srgb, ${tint} 35%, transparent), ${tint})` }}>
      <span className="flex h-full w-full items-center justify-center rounded-full bg-card2" style={{ color: tint }}><Icon size={size * 0.4} strokeWidth={2.2} aria-hidden /></span>
    </span>
  );
}

function BadgeSheet({ badges, mine, onClose }: { badges: Badge[]; mine?: boolean; onClose: () => void }) {
  const list = mine ? badges : badges.filter((b) => b.earned);
  return (
    <Sheet open onClose={onClose} title={`Achievements · ${badges.filter((b) => b.earned).length}`} icon={Trophy}>
      <ul className="grid grid-cols-3 gap-x-2 gap-y-4">
        {list.map((b) => (
          <li key={b.id} className={cx("flex flex-col items-center gap-1 text-center", !b.earned && "opacity-80")}>
            <BadgeMedal b={b} size={64} />
            <span className="text-xs font-semibold leading-tight">{b.label}</span>
            <span className="text-[11px] text-mute num">{b.earned ? TIER[b.tier - 1] : <><Lock size={10} className="mr-0.5 inline" aria-hidden />{fmtNum(Math.min(b.value, b.target))}/{fmtNum(b.target)}</>}</span>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

/** This week Sat → Fri: lime = lifted, blue = cardio, ring = today. Compact, one glance. */
export function WeekStrip({ days, today }: { days: WeekDay[]; today: string }) {
  const n = days.filter((d) => d.lift || d.cardio).length;
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-card px-3 py-2.5">
      <div className="shrink-0">
        <div className="text-lg font-bold leading-none num">{n}<span className="text-sm font-medium text-mute">/7</span></div>
        <div className="mt-0.5 text-[11px] text-mute">this week</div>
      </div>
      <ol className="grid flex-1 grid-cols-7 gap-1" aria-label={`Trained ${n} of 7 days this week`}>
        {days.map((d) => {
          const wd = new Date(`${d.date}T12:00:00`).toLocaleDateString("en-US", { weekday: "narrow" });
          const label = `${new Date(`${d.date}T12:00:00`).toLocaleDateString("en-US", { weekday: "long" })}: ${d.lift && d.cardio ? "lifted + cardio" : d.lift ? "lifted" : d.cardio ? "cardio" : d.date > today ? "upcoming" : "rest"}`;
          return (
            <li key={d.date} className="flex flex-col items-center gap-1" aria-label={label}>
              <span className={cx("flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold", d.lift ? "bg-acc text-acc-ink" : d.cardio ? "bg-info text-black" : d.date > today ? "bg-card2/60 text-faint" : "bg-card2 text-mute", d.date === today && "ring-2 ring-ink/70 ring-offset-2 ring-offset-card")}>
                {d.lift ? <Dumbbell size={13} aria-hidden /> : d.cardio ? <HeartPulse size={13} aria-hidden /> : null}
              </span>
              <span className={cx("text-[10px] leading-none", d.date === today ? "font-bold text-ink" : "text-faint")} aria-hidden>{wd}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
