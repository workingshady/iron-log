import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Flame, Footprints, Minus, Pause, Play, Plus, Square, Timer, Trash2, TriangleAlert, X } from "lucide-react";
import type { AppState, CardioLog, DashboardData, HistoryRow } from "../../shared/api";
import { CARDIO_PLAN, CARDIO_TIPS, PROTOCOLS, estimateKcal, segments, type CardioProtocol, type SegKind } from "../../program/cardio";
import { queue, send, track, uid } from "../lib/api";
import { useLoad } from "../lib/useLoad";
import { beep, clock, cx, niceDate, today, unlockAudio, vibrate } from "../lib/util";
import { Badge, Btn, Card, Chips, Label, NumInput, PageHead, Sheet, scale } from "../components/ui";
import { useWeekPlan } from "../components/WeekPlanner";

const KIND: Record<SegKind, { dot: string; text: string; label: string }> = {
  warm: { dot: "bg-faint", text: "text-mute", label: "warm-up" },
  cool: { dot: "bg-faint", text: "text-mute", label: "cool-down" },
  easy: { dot: "bg-info", text: "text-info", label: "recover" },
  steady: { dot: "bg-info", text: "text-info", label: "steady" },
  hill: { dot: "bg-acc", text: "text-acc", label: "hill" },
  hard: { dot: "bg-warn", text: "text-warn", label: "hard" },
};
const LIVE = "il_cardio_live";
type Live = { id: string; protocol: string; startedAt: number; pausedAt: number | null; pausedMs: number; speedAdj: number };

function loadLive(): Live | null {
  try { return JSON.parse(localStorage.getItem(LIVE) ?? "null"); } catch { return null; }
}
function saveLive(l: Live | null) {
  try { if (l) localStorage.setItem(LIVE, JSON.stringify(l)); else localStorage.removeItem(LIVE); } catch { /* ignore */ }
}

export default function Cardio() {
  const { data: st } = useLoad<AppState>("/state");
  const { data: hist } = useLoad<HistoryRow[]>("/history");
  const { data: dash, reload: reloadDash } = useLoad<DashboardData>(`/dashboard?today=${today()}`);
  const { data: logs, reload } = useLoad<CardioLog[]>("/cardio");
  const { data: body } = useLoad<{ date: string; weightKg: number | null }[]>("/body");
  const [live, setLiveState] = useState<Live | null>(loadLive);
  const [pick, setPick] = useState<string | null>(null);
  const [logSheet, setLogSheet] = useState<null | { protocol: string; minutes: number; status: "done" | "partial"; live?: Live }>(null);
  const [tips, setTips] = useState(false);
  const setLive = (l: Live | null) => { saveLive(l); setLiveState(l); };
  const { plan: wp } = useWeekPlan();

  const kg = body?.find((b) => b.weightKg)?.weightKg ?? (Number(st?.settings?.bodyKg) || 80);

  // which day is it? follows the ADAPTED week (football, moved sessions), not a fixed weekday
  const todays = hist?.find((h) => h.date === today() && (h.status === "done" || h.status === "active"));
  const tDay = wp?.days.find((d) => d.today);
  const tmr = wp?.days.find((d) => d.iso > today());
  const footballToday = tDay?.kind === "football";
  const dayKey = todays?.dayKey ?? (tDay?.kind === "planned" ? tDay.dayKey! : "rest");
  let plan = footballToday ? null : CARDIO_PLAN[dayKey === "rest" ? "rest" : dayKey] ?? null;
  // never hard intervals the day before football or the day before Legs
  const hardTomorrow = tmr && (tmr.kind === "football" || /leg/i.test(tmr.dayName ?? ""));
  if (plan && PROTOCOLS[plan.key].intensity === "hard" && hardTomorrow) plan = { key: "hill_walk30", when: `${tmr!.kind === "football" ? "football" : "Legs"} tomorrow — easy hill walk instead of intervals` };
  const proto = PROTOCOLS[pick ?? plan?.key ?? "hill_walk30"];
  const doneToday = (logs ?? []).filter((l) => l.date === today());

  if (live) return <LiveTimer live={live} setLive={setLive} kg={kg} onFinish={(minutes, status) => setLogSheet({ protocol: live.protocol, minutes, status, live })} logSheet={logSheet} setLogSheet={setLogSheet} reload={() => { reload(); reloadDash(); }} />;

  return (
    <div>
      <PageHead icon={Footprints} title="Cardio" sub="Treadmill after lifting, about 3×/week — not every day. Check it off when you do it." />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {/* today */}
        <Card className="md:col-span-2">
          <div className="mb-1 flex flex-wrap items-center gap-2 text-xs uppercase tracking-wide text-mute">
            Today · {todays ? `after ${todays.dayName}` : dayKey === "rest" ? "rest day" : `${st?.slots.find((s) => s.dayKey === dayKey)?.dayName ?? dayKey} day`}
            {plan?.optional && <Badge tone="info">optional</Badge>}
            {doneToday.length > 0 && <Badge tone="acc"><Check size={11} /> {doneToday[0].status}</Badge>}
          </div>
          {footballToday && !pick ? (
            <div className="rounded-xl bg-warn/10 p-4 text-sm">
              <b className="text-warn">⚽ Football today = your cardio.</b>
              <p className="mt-1 text-mute">After the game, log it from the week card (Home or Plan): tap today → Log the game.</p>
            </div>
          ) : plan === null && !pick ? (
            <div className="rounded-xl bg-card2 p-4 text-sm">
              <b>No cardio today — heavy leg day.</b>
              <p className="mt-1 text-mute">A 10-min easy walk to cool down is fine. Or pick a session below if you really want one.</p>
            </div>
          ) : (
            <ProtocolView p={proto} kg={kg} when={!pick ? plan?.when : undefined} />
          )}
          <div className="mt-3">
            <Label>Other sessions</Label>
            <Chips small options={Object.values(PROTOCOLS).map((x) => ({ id: x.key, label: `${x.name}` }))} value={pick ?? plan?.key ?? null} onChange={(v) => setPick(v)} />
          </div>
          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Btn kind="primary" icon={Play} onClick={() => { unlockAudio(); const l = { id: uid(), protocol: proto.key, startedAt: Date.now(), pausedAt: null, pausedMs: 0, speedAdj: 0 }; setLive(l); track("cardio_start", { protocol: proto.key }); }}>Start timer</Btn>
            <Btn kind="soft" icon={Check} onClick={() => setLogSheet({ protocol: proto.key, minutes: proto.minutes, status: "done" })}>Done already</Btn>
            <Btn kind="soft" icon={X} onClick={() => { if ((logs ?? []).some((l) => l.date === today() && l.protocol === proto.key && l.status === "skipped")) return; queue("PUT", `/cardio/skip-${today()}-${proto.key}`, { date: today(), protocol: proto.key, status: "skipped", minutes: 0 }, `cardio skip ${today()} ${proto.key}`); track("cardio_skip", { protocol: proto.key }); setTimeout(() => { reload(); reloadDash(); }, 700); }}>Skip today</Btn>
          </div>
        </Card>

        {/* week */}
        <div className="grid content-start gap-3">
          <Card title="This week" icon={Flame}>
            <div className="text-3xl font-bold num">{dash?.cardioWeek?.sessions ?? 0}<span className="text-base text-mute"> / 3 sessions</span></div>
            <div className="text-sm text-mute num">{dash?.cardioWeek?.minutes ?? 0} min · ~{dash?.cardioWeek?.kcal ?? 0} kcal</div>
            <WeekDots days={dash?.cardioDays ?? {}} />
          </Card>
          <Card title="Where cardio goes" icon={Timer}>
            <ul className="space-y-1 text-xs">
              {(["D1", "D2", "D3", "D5", "D6", "rest"] as const).map((k) => {
                const c = CARDIO_PLAN[k];
                const name = k === "rest" ? "Rest days" : st?.slots.find((s) => s.dayKey === k)?.dayName ?? k;
                return (
                  <li key={k} className="flex justify-between gap-2">
                    <span className="text-mute">{name}</span>
                    <span className={c ? (c.optional ? "text-info" : "text-ink") : "text-faint"}>{c ? `${PROTOCOLS[c.key].name}${c.optional ? " (opt.)" : ""}` : "none"}</span>
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>

        {/* tips */}
        <Card className="md:col-span-3">
          <button onClick={() => setTips(!tips)} className="flex w-full items-center gap-2 text-left text-sm font-semibold text-mute">
            <Flame size={16} /> <span className="flex-1">Before · during · after</span> <ChevronDown size={16} className={cx("transition", tips && "rotate-180")} />
          </button>
          {tips && (
            <div className="mt-3 grid gap-3 text-sm md:grid-cols-3">
              {(["before", "during", "after"] as const).map((k) => (
                <div key={k} className="rounded-xl bg-card2 p-3">
                  <div className="mb-1 font-semibold capitalize">{k}</div>
                  <ul className="space-y-1 text-mute">{CARDIO_TIPS[k].map((x) => <li key={x}>• {x}</li>)}</ul>
                </div>
              ))}
              <p className="flex items-center gap-2 text-bad md:col-span-3"><TriangleAlert size={15} /> {CARDIO_TIPS.stop}</p>
            </div>
          )}
        </Card>

        {/* history */}
        <Card title="History" icon={Footprints} className="md:col-span-3">
          {!logs?.length && <p className="text-sm text-mute">Nothing yet. Start the timer or tap "Done already" after a session.</p>}
          {logs?.map((l) => (
            <div key={l.id} className="flex items-center gap-3 border-b border-line/60 py-2 text-sm last:border-0">
              <span className="w-20 shrink-0 text-xs text-mute">{niceDate(l.date)}</span>
              <span className="min-w-0 flex-1 truncate">{l.protocol === "football" ? "⚽ Football" : PROTOCOLS[l.protocol]?.name ?? l.protocol}</span>
              <span className={cx("text-xs num", l.status === "skipped" ? "text-bad" : l.status === "partial" ? "text-warn" : "text-acc")}>
                {l.status === "skipped" ? "skipped" : `${Math.round(l.minutes ?? 0)} min · ${l.kcalMachine ?? l.kcalEst ?? "?"} kcal`}
              </span>
              <button onClick={async () => { if (confirm("Delete this entry?")) { await send("DELETE", `/cardio/${l.id}`); reload(); reloadDash(); } }} className="flex h-11 w-11 items-center justify-center text-faint hover:text-bad" aria-label="Delete"><Trash2 size={15} /></button>
            </div>
          ))}
        </Card>
      </div>

      {logSheet && <LogSheet s={logSheet} kg={kg} onClose={() => setLogSheet(null)} onSaved={() => { setLogSheet(null); reload(); reloadDash(); }} />}
    </div>
  );
}

function WeekDots({ days }: { days: Record<string, number> }) {
  const d = new Date();
  const list = Array.from({ length: 7 }, (_, i) => { const x = new Date(d); x.setDate(d.getDate() - 6 + i); return x; });
  return (
    <div className="mt-3 flex gap-1.5">
      {list.map((x) => {
        const iso = x.toISOString().slice(0, 10);
        const local = `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
        const m = days[local] ?? days[iso];
        return (
          <div key={local} className="flex-1 text-center">
            <div className={cx("mx-auto h-7 w-7 rounded-full text-[10px] leading-7", m != null ? "bg-acc font-bold text-acc-ink" : "bg-card2 text-faint")}>{m != null ? m : ""}</div>
            <div className="mt-1 text-[10px] text-mute">{"SMTWTFS"[x.getDay()]}</div>
          </div>
        );
      })}
    </div>
  );
}

function ProtocolView({ p, kg, when }: { p: CardioProtocol; kg: number; when?: string }) {
  let t = 0;
  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h2 className="text-2xl font-bold">{p.name}</h2>
        <Badge tone={p.intensity === "hard" ? "warn" : p.intensity === "moderate" ? "acc" : "info"}>{p.intensity}</Badge>
      </div>
      <p className="text-sm text-mute">{p.short}{when ? ` · ${when}` : ""}</p>
      <div className="mt-2 flex gap-4 text-sm">
        <span className="inline-flex items-center gap-1"><Timer size={14} className="text-mute" />{p.minutes} min</span>
        <span className="inline-flex items-center gap-1"><Flame size={14} className="text-warn" />~{estimateKcal(p, kg)} kcal <span className="text-xs text-mute">(at {kg} kg)</span></span>
      </div>

      <div className="mt-3 overflow-hidden rounded-xl border border-line">
        <table className="w-full text-sm num">
          <thead className="bg-card2 text-left text-[11px] uppercase tracking-wide text-mute">
            <tr><th className="px-3 py-2">Min</th><th className="py-2">What</th><th className="py-2 text-right">km/h</th><th className="px-3 py-2 text-right">Incline</th></tr>
          </thead>
          <tbody>
            {p.blocks.map((b, bi) => {
              const blockMin = b.rows.reduce((a, r) => a + r.min, 0) * (b.rounds ?? 1);
              const start = t;
              t += blockMin;
              return [
                b.rounds ? (
                  <tr key={`h${bi}`} className="border-t border-line bg-card2/50">
                    <td className="px-3 py-1.5 text-xs text-mute">{start}–{start + blockMin}</td>
                    <td colSpan={3} className="py-1.5 text-xs font-semibold">{b.rounds} rounds of:</td>
                  </tr>
                ) : null,
                ...b.rows.map((r, ri) => {
                  const k = KIND[r.kind];
                  const s0 = b.rounds ? null : start + b.rows.slice(0, ri).reduce((a, x) => a + x.min, 0);
                  return (
                    <tr key={`${bi}-${ri}`} className="border-t border-line/60">
                      <td className="px-3 py-2 text-xs text-mute">{s0 != null ? `${s0}–${s0 + r.min}` : `${r.min} min`}</td>
                      <td className="py-2"><span className={cx("mr-2 inline-block h-2 w-2 rounded-full", k.dot)} /><span className={r.kind === "hard" ? "font-semibold text-warn" : ""}>{r.label}</span></td>
                      <td className="py-2 text-right font-semibold">{r.speed.toFixed(1)}</td>
                      <td className="px-3 py-2 text-right">{r.incline}%</td>
                    </tr>
                  );
                }),
              ];
            })}
          </tbody>
        </table>
      </div>
      <ul className="mt-3 space-y-1 text-sm">{p.feel.map((f) => <li key={f} className="flex gap-2"><span className="text-info">•</span>{f}</li>)}</ul>
      <p className="mt-2 text-xs text-mute">{p.adjust}</p>
    </div>
  );
}

function LiveTimer({ live, setLive, kg, onFinish, logSheet, setLogSheet, reload }: {
  live: Live; setLive: (l: Live | null) => void; kg: number; onFinish: (minutes: number, status: "done" | "partial") => void;
  logSheet: { protocol: string; minutes: number; status: "done" | "partial"; live?: Live } | null; setLogSheet: (x: null) => void; reload: () => void;
}) {
  const p = PROTOCOLS[live.protocol];
  const segs = useMemo(() => segments(p), [p]);
  const total = segs.reduce((a, s) => a + s.sec, 0);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(i); }, []);
  // keep the screen on
  useEffect(() => {
    if (!("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    navigator.wakeLock.request("screen").then((l) => (lock = l)).catch(() => {});
    return () => { lock?.release().catch(() => {}); };
  }, []);

  const elapsed = Math.max(0, ((live.pausedAt ?? now) - live.startedAt - live.pausedMs) / 1000);
  let acc = 0, idx = segs.length - 1;
  for (let i = 0; i < segs.length; i++) { if (elapsed < acc + segs[i].sec) { idx = i; break; } acc += segs[i].sec; }
  const seg = segs[idx];
  const left = Math.max(0, acc + seg.sec - elapsed);
  const done = elapsed >= total;
  const next = segs[idx + 1];
  const speed = seg.speed + (seg.kind === "hard" ? live.speedAdj : 0);

  // beeps: short 3-2-1 before each change, buzz + beep when the part changes
  const prevIdx = useRef(idx);
  const lastCount = useRef("");
  useEffect(() => {
    if (idx !== prevIdx.current) { prevIdx.current = idx; vibrate([200, 80, 200]); beep(); }
  }, [idx]);
  useEffect(() => {
    if (live.pausedAt || !next) return;
    const s = Math.ceil(left);
    const key = `${idx}-${s}`;
    if (s >= 1 && s <= 3 && lastCount.current !== key) { lastCount.current = key; beep(); }
  }, [left, idx, next, live.pausedAt]);

  useEffect(() => { if (done && !logSheet) onFinish(Math.round(total / 60), "done"); }, [done]); // eslint-disable-line react-hooks/exhaustive-deps

  const k = KIND[seg.kind];
  const round = seg.round ? `Round ${seg.round}/${p.blocks.find((b) => b.rounds)?.rounds}` : "";
  const adj = (d: number) => setLive({ ...live, speedAdj: Math.round((live.speedAdj + d) * 10) / 10 });

  return (
    <div className="mx-auto max-w-md">
      <div className="mb-3 flex items-center justify-between text-sm text-mute">
        <span>{p.name}</span>
        <span className="num">{clock(elapsed * 1000)} / {clock(total * 1000)}</span>
      </div>
      <div className="h-1.5 rounded bg-card2"><div className="h-1.5 rounded bg-acc transition-all" style={{ width: `${Math.min(100, (elapsed / total) * 100)}%` }} /></div>

      <section className={cx("mt-4 rounded-3xl p-6 text-center", seg.kind === "hard" ? "bg-warn/15" : "bg-card")}>
        <div className={cx("text-xs font-semibold uppercase tracking-widest", k.text)}>{k.label}{round && ` · ${round}`}</div>
        <div className={cx("mt-1 text-3xl font-bold", seg.kind === "hard" && "text-warn")}>{seg.label}</div>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-card2 p-3"><div className="text-[11px] uppercase text-mute">Speed km/h</div><div className="text-5xl font-bold num">{speed.toFixed(1)}</div></div>
          <div className="rounded-2xl bg-card2 p-3"><div className="text-[11px] uppercase text-mute">Incline</div><div className="text-5xl font-bold num">{seg.incline}%</div></div>
        </div>
        <div className="mt-5 text-6xl font-bold num">{clock(left * 1000)}</div>
        <div className="mt-1 text-xs text-mute">left in this part</div>
        {next && <div className="mt-4 text-sm text-mute">Next: <b className="text-ink">{next.label}</b> · {(next.speed + (next.kind === "hard" ? live.speedAdj : 0)).toFixed(1)} km/h · {next.incline}%</div>}
      </section>

      <div className="mt-3 flex items-center justify-center gap-2 text-sm">
        <span className="text-mute">Run speed</span>
        <button onClick={() => adj(-0.5)} className="flex h-11 w-11 items-center justify-center rounded-xl bg-card2" aria-label="Slower runs"><Minus size={18} /></button>
        <span className="w-14 text-center font-semibold num">{live.speedAdj >= 0 ? "+" : ""}{live.speedAdj.toFixed(1)}</span>
        <button onClick={() => adj(0.5)} className="flex h-11 w-11 items-center justify-center rounded-xl bg-card2" aria-label="Faster runs"><Plus size={18} /></button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        {live.pausedAt ? (
          <Btn kind="primary" icon={Play} onClick={() => setLive({ ...live, pausedMs: live.pausedMs + (Date.now() - live.pausedAt!), pausedAt: null })}>Resume</Btn>
        ) : (
          <Btn kind="soft" icon={Pause} onClick={() => setLive({ ...live, pausedAt: Date.now() })}>Pause</Btn>
        )}
        <Btn kind="danger" icon={Square} onClick={() => onFinish(Math.round(elapsed / 60), elapsed >= total - 30 ? "done" : "partial")}>End</Btn>
      </div>
      <p className="mt-3 text-center text-xs text-faint">Beeps 3-2-1 before each change. The screen stays on.</p>

      {logSheet && <LogSheet s={logSheet} kg={kg} onClose={() => setLogSheet(null)} onSaved={() => { setLive(null); setLogSheet(null); reload(); }} />}
    </div>
  );
}

function LogSheet({ s, kg, onClose, onSaved }: { s: { protocol: string; minutes: number; status: "done" | "partial"; live?: Live }; kg: number; onClose: () => void; onSaved: () => void }) {
  const p = PROTOCOLS[s.protocol];
  const [min, setMin] = useState(String(s.minutes));
  const [dist, setDist] = useState("");
  const [kcal, setKcal] = useState("");
  const [rpe, setRpe] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const est = Math.round(estimateKcal(p, kg, s.live?.speedAdj ?? 0) * Math.min(1, Number(min || 0) / p.minutes));
  function save() {
    const m = Number(min);
    if (!(m >= 0 && m <= 300)) return alert("Minutes 0-300");
    const id = s.live?.id ?? uid();
    queue("PUT", `/cardio/${id}`, {
      date: today(), protocol: p.key, status: s.status, startedAt: s.live?.startedAt ?? null, endedAt: s.live ? Date.now() : null, minutes: m,
      distanceKm: dist ? Number(dist) : null, kcalMachine: kcal ? Number(kcal) : null, kcalEst: est, rpe, speedAdj: s.live?.speedAdj ?? null, note: note || null,
    }, `cardio ${id}`);
    track("cardio_log", { protocol: p.key, minutes: m, status: s.status });
    setTimeout(onSaved, 600);
  }
  return (
    <Sheet open onClose={onClose} title={s.status === "partial" ? "Save (stopped early)" : "Cardio done"} icon={Check}>
      <p className="text-sm text-mute">{p.name} · estimate ~{est} kcal. Copy the treadmill's numbers if you want (optional).</p>
      <div className="mt-2 grid grid-cols-3 gap-2">
        <div><Label>Minutes</Label><NumInput value={min} onChange={setMin} /></div>
        <div><Label>Km</Label><NumInput value={dist} onChange={setDist} placeholder="opt." /></div>
        <div><Label>Kcal (machine)</Label><NumInput value={kcal} onChange={setKcal} placeholder="opt." /></div>
      </div>
      <Label>How hard overall? (1-10)</Label>
      <Chips small options={scale(1, 10)} value={rpe} onChange={setRpe} />
      <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Note (optional)" className="mt-3 w-full rounded-xl bg-card2 p-3 outline-none focus:ring-2 focus:ring-acc" />
      <Btn kind="primary" icon={Check} className="mt-4 w-full" onClick={save}>Save</Btn>
    </Sheet>
  );
}
