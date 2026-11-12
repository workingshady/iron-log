import { useState } from "react";
import { Activity, Camera, CircleDot, Dumbbell, Eye, Lock, Scale, Shield, Trophy, UserRound, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { PRIVACY_DEFAULTS, type Privacy as P } from "../../shared/social";
import { Btn, PageHead, SectionHead, Sheet } from "../components/ui";
import { sx } from "../components/social/lib";
import { useLoad } from "../lib/useLoad";
import { useMe } from "../lib/me";
import { cx } from "../lib/util";
import UserProfile from "./UserProfile";

type Opt<K extends keyof P> = { id: P[K]; label: string };
const VIS: Opt<"workouts">[] = [{ id: "friends", label: "Friends" }, { id: "private", label: "Only me" }];
const ROWS: { key: keyof P; icon: LucideIcon; title: string; help: string; opts: { id: string | boolean; label: string }[] }[] = [
  { key: "profile", icon: UserRound, title: "Profile (bio + totals)", help: "Your username, name and profile photo are always findable by members so friends can add you. This controls the bio and header for others.", opts: [{ id: "members", label: "Members" }, { id: "friends", label: "Friends" }, { id: "private", label: "Only me" }] },
  { key: "workouts", icon: Dumbbell, title: "Recent workouts", help: "Day name, date, duration, sets and volume on your profile. Never notes or pain.", opts: VIS },
  { key: "prs", icon: Trophy, title: "Personal records", help: "Your PR count and latest PRs.", opts: VIS },
  { key: "stats", icon: Activity, title: "Totals and streak", help: "Workouts done, weekly streak, training since.", opts: VIS },
  { key: "body", icon: Scale, title: "Bodyweight", help: "Your latest weigh-in on your profile. Off by default: body data is sensitive.", opts: VIS },
  { key: "online", icon: CircleDot, title: "Online status", help: "“Active now” / “Active 3 h ago”.", opts: VIS },
  { key: "photos", icon: Camera, title: "Photos in new posts", help: "Default for photos you add to a post. Photos you don't post stay private; each one can be changed.", opts: VIS },
  { key: "leaderboard", icon: Users, title: "Leaderboard", help: "Join the friends leaderboard. You only see the board after you join, and you can leave any time.", opts: [{ id: true, label: "Join" }, { id: false, label: "Off" }] },
];

/** What friends can see. Every switch is yours; health-ish data is private by default; some things can never be shared. */
export default function Privacy() {
  const { data, setData } = useLoad<P>("/privacy");
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const me = useMe();
  const pv = data ?? PRIVACY_DEFAULTS;

  async function set(key: keyof P, v: string | boolean) {
    const prev = pv;
    setData({ ...pv, [key]: v } as P); setErr(null);
    try { setData(await sx<P>("PUT", "/privacy", { [key]: v })); setSaved("Saved"); setTimeout(() => setSaved(null), 1500); }
    catch (e) { setData(prev); setErr((e as Error).message); }
  }

  return (
    <div className="md:mx-auto md:max-w-xl">
      <PageHead icon={Shield} title="Privacy" sub="You decide what friends see. Only accepted friends ever see shared things." />
      <p className="sr-only" role="status" aria-live="polite">{saved ?? ""}</p>

      <Btn kind="soft" icon={Eye} className="w-full" onClick={() => setPreview(true)} disabled={!me}>Preview your profile as a friend</Btn>

      <SectionHead>Shared with</SectionHead>
      <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-card">
        {ROWS.map((r) => (
          <li key={r.key} className="px-4 py-3">
            <div className="flex items-start gap-3">
              <r.icon size={18} className="mt-0.5 shrink-0 text-mute" aria-hidden />
              <div className="min-w-0 flex-1">
                <div id={`pv-${r.key}`} className="text-sm font-semibold">{r.title}</div>
                <p className="mt-0.5 text-xs leading-snug text-mute">{r.help}</p>
                <div role="radiogroup" aria-labelledby={`pv-${r.key}`} className="mt-2 flex rounded-xl bg-card2 p-1">
                  {r.opts.map((o) => {
                    const on = pv[r.key] === o.id;
                    return (
                      <button key={String(o.id)} type="button" role="radio" aria-checked={on} onClick={() => !on && set(r.key, o.id)}
                        className={cx("min-h-10 flex-1 rounded-lg text-sm transition-colors", on ? "bg-card3 font-semibold text-ink" : "text-mute hover:text-ink")}>
                        {o.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>
      {err && <p role="alert" className="mt-2 text-sm text-bad">{err}</p>}

      <SectionHead>Always private</SectionHead>
      <div className="rounded-2xl bg-card p-4">
        <div className="flex items-start gap-3">
          <Lock size={18} className="mt-0.5 shrink-0 text-acc" aria-hidden />
          <p className="text-sm leading-snug">Your <b>journal</b>, <b>set notes</b>, <b>pain</b>, readiness, sleep and creatine are never shown to anyone, not even in shared workouts. Photos stay private unless you post them or share them one by one.</p>
        </div>
      </div>
      <p className="mt-3 px-1 text-xs text-faint">Blocked people can't find you, see anything, or message you. Manage blocks in <a href="#/friends" className="text-info underline">Friends</a>.</p>

      {preview && me && (
        <Sheet open onClose={() => setPreview(false)} title="How friends see you" icon={Eye}>
          <div className="-mx-4 md:-mx-6"><UserProfile username={me.username} asFriend /></div>
        </Sheet>
      )}
    </div>
  );
}
