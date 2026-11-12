import { useState } from "react";
import { ArrowLeftRight, CalendarRange, MapPin, PlayCircle, Target, Trophy } from "lucide-react";
import type { AppState, Lifts, PlanItem } from "../../shared/api";
import { useProgram } from "../lib/program";
import { EXERCISES } from "../../program/exercises";
import { targetLabel } from "../../shared/plan";
import { recommend } from "../../shared/recommend";
import { shownKg, loadOf } from "../../shared/load";
import { send, track } from "../lib/api";
import { useLoad } from "../lib/useLoad";
import { cx, kg, niceDate } from "../lib/util";
import { Btn, Sheet } from "./ui";
import { hasRestOverride, restFor } from "../lib/restPrefs";
import { PhotoStrip } from "./Photos";
import { clock } from "../lib/util";

/** Your saved setup for an exercise (seat height, pin, grip…) — stored in settings as "setup:<exKey>". */
export function useSetupNote(exKey: string) {
  const { data: s, setData } = useLoad<AppState>("/state");
  const value = s?.settings?.[`setup:${exKey}`] ?? "";
  const save = async (v: string) => {
    setData((x) => (x ? { ...x, settings: { ...x.settings, [`setup:${exKey}`]: v } } : x));
    await send("PUT", `/settings/setup:${exKey}`, { value: v });
    track("setup_note", { ex: exKey });
  };
  return { value, save };
}

export function SetupNote({ exKey, compact }: { exKey: string; compact?: boolean }) {
  const { value, save } = useSetupNote(exKey);
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState(value);
  if (edit)
    return (
      <div className="flex gap-2">
        <input autoFocus value={v} onChange={(e) => setV(e.target.value)} placeholder="e.g. seat 4 · pin 6 · grip on the rings" className="min-h-10 min-w-0 flex-1 rounded-lg bg-card2 px-3 text-sm outline-none focus:ring-2 focus:ring-acc" />
        <button onClick={() => { save(v.trim()); setEdit(false); }} className="min-h-10 rounded-lg bg-acc px-3 text-sm font-semibold text-acc-ink">Save</button>
      </div>
    );
  return (
    <button onClick={() => { setV(value); setEdit(true); }} className={cx("inline-flex items-center gap-1.5 text-left text-xs", value ? "text-ink" : "text-info")}>
      <MapPin size={13} className="shrink-0 text-info" />
      {value ? <span><span className="text-mute">Setup:</span> {value}</span> : compact ? "Add setup (seat, pin…)" : "Add your setup note (seat height, pin, grip…) — remembered every session"}
    </button>
  );
}

/** Your rest for this exercise (overrides the plan; "Off" = no timer). Saved in settings → synced everywhere. */
export function RestSetting({ item }: { item: PlanItem }) {
  const { data: s, setData } = useLoad<AppState>("/state");
  const cur = restFor(s?.settings, item);
  const custom = hasRestOverride(s?.settings, item.ex);
  const save = async (v: number | null) => {
    const key = `rest:${item.ex}`;
    setData((x) => (x ? { ...x, settings: { ...x.settings, [key]: v == null ? "" : String(v) } } : x));
    await send("PUT", `/settings/${key}`, { value: v == null ? "" : String(v) });
    track("rest_pref", { ex: item.ex, rest: v });
  };
  const opts = [45, 60, 75, 90, 120, 150, 180, 240];
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between text-[11px] uppercase tracking-wide text-mute">
        <span>Rest between sets</span>
        <span className="normal-case tracking-normal">{custom ? <button onClick={() => save(null)} className="text-info">reset to plan ({clock(item.rest * 1000)})</button> : `plan: ${clock(item.rest * 1000)}`}</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {opts.map((o) => (
          <button key={o} onClick={() => save(o)} className={cx("min-h-9 rounded-full border px-2.5 text-xs num", cur === o && (custom || o === item.rest) ? "border-info bg-info/15 font-semibold text-info" : "border-line text-mute")}>{clock(o * 1000)}</button>
        ))}
        <button onClick={() => save(0)} className={cx("min-h-9 rounded-full border px-2.5 text-xs", custom && cur === 0 ? "border-info bg-info/15 font-semibold text-info" : "border-line text-mute")}>Off</button>
      </div>
    </div>
  );
}

/** Everything about one exercise in one sheet: video, cues, your setup, 4-week targets, last time, next, best, alternatives. */
export function ExerciseSheet({ item, onClose, onSwap }: { item: PlanItem; onClose: () => void; onSwap?: () => void }) {
  const { data: lifts } = useLoad<Lifts>("/lifts");
  const [play, setPlay] = useState(false);
  const program = useProgram(); // the plan this user trains (default = CURRENT)
  const e = EXERCISES[item.ex];
  const yt = item.yt[0];
  const hist = lifts?.hist[item.ex];
  const best = lifts?.best[item.ex];
  const unit = loadOf(item.ex) === "pair" ? "/hand" : "";
  // where this exercise appears in the program, week by week
  const uses = program.weeks.map((w) => ({ w, rows: w.days.flatMap((d) => d.items.filter((x) => x.ex === item.ex).map((x) => ({ d, x }))) })).filter((u) => u.rows.length);
  const rec = recommend(item.ex, item, lifts?.hist ?? {}, {});
  const q = encodeURIComponent(`${item.name} proper form tutorial`);

  return (
    <Sheet open onClose={onClose} title={item.name} icon={PlayCircle}>
      {yt ? (
        play ? (
          <div className="aspect-video overflow-hidden rounded-xl bg-black">
            <iframe className="h-full w-full" src={`https://www.youtube-nocookie.com/embed/${yt}?autoplay=1&rel=0&playsinline=1`} title={item.name} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen />
          </div>
        ) : (
          <button onClick={() => { setPlay(true); track("video_open", { ex: item.ex }); }} className="relative block aspect-video w-full overflow-hidden rounded-xl bg-black">
            <img src={`https://i.ytimg.com/vi/${yt}/hqdefault.jpg`} alt="" className="h-full w-full object-cover opacity-80" />
            <span className="absolute inset-0 m-auto flex h-14 w-14 items-center justify-center rounded-full bg-black/70 text-2xl">▶</span>
          </button>
        )
      ) : (
        <a href={`https://www.youtube.com/results?search_query=${q}`} target="_blank" rel="noreferrer" className="block rounded-xl border border-line py-3 text-center text-sm">Search YouTube for a video</a>
      )}

      <p className="mt-3 text-sm text-mute">{item.muscles}</p>
      <ul className="mt-2 space-y-1">{item.cues.map((c) => <li key={c} className="flex gap-2 text-sm"><span className="text-acc">•</span>{c}</li>)}</ul>
      <div className="mt-3 space-y-2 rounded-xl bg-card2 p-3">
        <SetupNote exKey={item.ex} />
        <PhotoStrip refKind="exercise" refId={item.ex} label="Machine / setup photo" compact />
      </div>
      <div className="mt-3 rounded-xl bg-card2 p-3"><RestSetting item={item} /></div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-xl bg-card2 p-3">
          <div className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-mute"><Target size={12} />Next</div>
          <div className={cx("mt-1 font-semibold num", rec.kind === "up" ? "text-acc" : rec.kind === "down" ? "text-warn" : "text-ink")}>
            {rec.weightKg != null ? `${kg(rec.weightKg)} kg${unit}${rec.reps ? ` × ${rec.reps}` : ""}` : rec.seconds ? `${rec.seconds} s` : rec.reps ? `${rec.reps} reps` : "find it"}
          </div>
          <div className="text-[11px] text-mute">{rec.why}</div>
        </div>
        <div className="rounded-xl bg-card2 p-3">
          <div className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-mute"><Trophy size={12} />Best</div>
          <div className="mt-1 font-semibold num">{best ? (best.e1rm ? `${best.e1rm} kg est. max` : best.seconds ? `${best.seconds} s` : best.reps ? `${best.reps} reps` : "—") : "—"}</div>
          {hist && <div className="text-[11px] text-mute">Last {niceDate(hist.date)}: {hist.sets.filter((x) => x.kind !== "W").map((x) => `${shownKg(x) ?? "BW"}×${x.reps ?? x.seconds}`).join(", ")}</div>}
        </div>
      </div>

      {uses.length > 0 && (
        <div className="mt-3">
          <div className="mb-1.5 flex items-center gap-1 text-[11px] uppercase tracking-wide text-mute"><CalendarRange size={12} />In your program</div>
          <div className="overflow-hidden rounded-xl border border-line">
            {uses.map(({ w, rows }) => (
              <div key={w.n} className="flex items-center gap-3 border-b border-line/60 px-3 py-2 text-sm last:border-0">
                <span className="w-16 shrink-0 text-xs text-mute">W{w.n} {w.name.split(" ")[0]}</span>
                <span className="flex-1 num">{rows.map((r) => `${r.d.name}: ${targetLabel(r.x)}${r.x.finisher ? " (finisher)" : ""}`).join(" · ")}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {e?.alts?.length ? (
        <div className="mt-3">
          <div className="mb-1.5 flex items-center gap-1 text-[11px] uppercase tracking-wide text-mute"><ArrowLeftRight size={12} />Alternatives</div>
          <div className="flex flex-wrap gap-1.5">{e.alts.map((a) => <span key={a} className="rounded-full bg-card2 px-3 py-1.5 text-xs">{EXERCISES[a]?.name ?? a}</span>)}</div>
          {onSwap && <Btn kind="soft" icon={ArrowLeftRight} className="mt-2 w-full" onClick={onSwap}>Swap for one of these</Btn>}
        </div>
      ) : null}
    </Sheet>
  );
}
