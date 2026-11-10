import { useMemo, useState } from "react";
import { Activity, Dumbbell, FlaskConical, HeartPulse, NotebookPen, Pencil, Scale, Search, Trash2, TriangleAlert, X } from "lucide-react";
import { send, track, uid } from "../lib/api";
import { useLoad } from "../lib/useLoad";
import { cx, niceDate, today } from "../lib/util";
import { Btn, Chips, Empty, PageHead } from "../components/ui";
import { joinTags, parseTags, suggestTags } from "../../shared/notes";
import { VOICE_LANGS, VoiceButton, appendText, getVoiceLang, setVoiceLang, type VoiceLang } from "../components/Voice";

type Kind = "journal" | "set" | "workout" | "cardio" | "body" | "test";
type Note = { id: string; kind: Kind; date: string; at: number; text: string; tag?: string | null; mood?: number | null; title?: string; link?: string; pain?: string | null };

const TAGS = ["win", "struggle", "pain", "life", "food", "sleep", "idea"];
const KINDS: { id: Kind | "pain"; label: string }[] = [
  { id: "journal", label: "Journal" }, { id: "set", label: "Set notes" }, { id: "workout", label: "Workouts" },
  { id: "cardio", label: "Cardio" }, { id: "body", label: "Body" }, { id: "test", label: "Tests" }, { id: "pain", label: "Pain" },
];
const ICON: Record<Kind, typeof NotebookPen> = { journal: NotebookPen, set: Dumbbell, workout: Activity, cardio: HeartPulse, body: Scale, test: FlaskConical };
const COLOR: Record<Kind, string> = { journal: "text-acc", set: "text-ink", workout: "text-ink", cardio: "text-info", body: "text-vio", test: "text-warn" };
const MOODS = ["😣", "😕", "😐", "🙂", "😄"];
const MOOD_LABEL = ["awful", "low", "okay", "good", "great"];

/** Search that ignores Arabic spelling variants (أ/إ/آ → ا, ة → ه, ى → ي, tashkeel, tatweel) and case. */
const norm = (s: string) =>
  s.toLowerCase().replace(/[ً-ٰٟـ]/g, "").replace(/[أإآٱ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/ؤ/g, "و").replace(/ئ/g, "ي");
const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Mood 1-5, tap again to clear. */
function MoodPicker({ value, onChange }: { value: number | null; onChange: (m: number | null) => void }) {
  return (
    <div className="flex gap-1" role="radiogroup" aria-label="Mood">
      {MOODS.map((m, i) => (
        <button key={m} role="radio" aria-checked={value === i + 1} aria-label={MOOD_LABEL[i]} onClick={() => onChange(value === i + 1 ? null : i + 1)}
          className={cx("flex h-11 flex-1 items-center justify-center rounded-xl text-xl transition", value === i + 1 ? "bg-acc/15 ring-2 ring-acc" : "bg-card2 opacity-60")}>{m}</button>
      ))}
    </div>
  );
}

/** Multi-select tags; the ones your words suggest are dashed blue ("+ pain") — tap to add. Nothing is tagged silently. */
function TagPicker({ value, onChange, text }: { value: string[]; onChange: (t: string[]) => void; text: string }) {
  const sug = suggestTags(text).filter((t) => !value.includes(t));
  return (
    <div className="flex flex-wrap gap-1.5">
      {TAGS.map((t) => {
        const on = value.includes(t), s = sug.includes(t);
        return (
          <button key={t} onClick={() => onChange(on ? value.filter((x) => x !== t) : [...value, t])}
            className={cx("min-h-9 rounded-full border px-3 text-xs", on ? "border-acc bg-acc/10 text-acc" : s ? "border-dashed border-info text-info" : "border-line text-mute")}>
            {s && !on ? "+ " : ""}{t}
          </button>
        );
      })}
    </div>
  );
}

/** Highlights the searched words inside a note (exact match, any case). */
function Hl({ text, q }: { text: string; q: string }) {
  const w = q.trim();
  if (!w) return <>{text}</>;
  const parts = text.split(new RegExp(`(${escRe(w)})`, "gi"));
  return <>{parts.map((p, i) => (i % 2 ? <mark key={i} className="rounded bg-warn/30 px-0.5 text-ink">{p}</mark> : p))}</>;
}

export default function Journal() {
  const { data, reload } = useLoad<Note[]>("/notes");
  const [text, setText] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [mood, setMood] = useState<number | null>(null);
  const [date, setDate] = useState(today());
  const [kind, setKind] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<{ id: string; text: string; tags: string[]; mood: number | null } | null>(null);
  const [lang, setLang] = useState<VoiceLang>(getVoiceLang());

  async function save() {
    if (!text.trim()) return;
    await send("POST", "/journal", { id: uid(), date, text: text.trim(), tags: joinTags(tags), mood });
    track("journal_add", { tags, mood, chars: text.trim().length, suggested: suggestTags(text) });
    setText(""); setTags([]); setMood(null); setDate(today());
    reload();
  }
  async function saveEdit() {
    if (!edit || !edit.text.trim()) return;
    await send("PUT", `/journal/${edit.id}`, { text: edit.text.trim(), tags: joinTags(edit.tags), mood: edit.mood });
    track("journal_edit", {});
    setEdit(null); reload();
  }
  async function del(id: string) {
    if (!confirm("Delete this entry?")) return;
    await send("DELETE", `/journal/${id}`);
    setEdit(null); reload();
  }

  const list = useMemo(() => {
    const nq = norm(q.trim());
    return (data ?? []).filter((n) =>
      (!kind || (kind === "pain" ? !!n.pain || parseTags(n.tag).includes("pain") : n.kind === kind)) &&
      (!nq || norm(`${n.text} ${n.title ?? ""} ${n.tag ?? ""} ${n.pain ?? ""}`).includes(nq)));
  }, [data, kind, q]);
  const groups = useMemo(() => {
    const m = new Map<string, Note[]>();
    list.forEach((n) => m.set(n.date, [...(m.get(n.date) ?? []), n]));
    return [...m.entries()];
  }, [list]);
  // last 14 days of mood (the day's average of journal entries)
  const moodDays = useMemo(() => {
    const by = new Map<string, number[]>();
    (data ?? []).forEach((n) => { if (n.kind === "journal" && n.mood) by.set(n.date, [...(by.get(n.date) ?? []), n.mood]); });
    return Array.from({ length: 14 }, (_, i) => {
      const d = new Date(`${today()}T12:00:00Z`);
      d.setUTCDate(d.getUTCDate() - 13 + i);
      const iso = d.toISOString().slice(0, 10), v = by.get(iso);
      return { iso, mood: v ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null };
    });
  }, [data]);
  const stats = useMemo(() => {
    const m = (data ?? []).filter((n) => n.date.startsWith(today().slice(0, 7)));
    return { entries: m.filter((n) => n.kind === "journal").length, notes: m.length, pain: m.filter((n) => n.pain || parseTags(n.tag).includes("pain")).length };
  }, [data]);
  const sugNow = suggestTags(text).some((t) => !tags.includes(t));

  return (
    <div>
      <PageHead icon={NotebookPen} title="Notes & Journal" sub="Everything you wrote or said, in one place — Arabic, English or both. The monthly review reads all of it." />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_1.3fr]">
        {/* composer */}
        <div className="rounded-2xl bg-card p-4 md:sticky md:top-4 md:self-start">
          <textarea dir="auto" value={text} onChange={(e) => setText(e.target.value)} rows={5} placeholder="Write or speak — English, عربي or both. How was training, sleep, life?" className="w-full rounded-xl bg-card2 p-3 outline-none focus:ring-2 focus:ring-acc" />
          <div className="mt-2 flex items-center gap-2">
            <VoiceButton label onText={(t) => setText((v) => appendText(v, t))} className="px-3" />
            <div className="flex flex-1 justify-end gap-1">
              {VOICE_LANGS.map((l) => (
                <button key={l.id} title={l.hint} onClick={() => { setVoiceLang(l.id); setLang(l.id); track("voice_lang", { lang: l.id }); }}
                  className={cx("min-h-9 rounded-full border px-2.5 text-[11px]", lang === l.id ? "border-info bg-info/10 text-info" : "border-line text-mute")}>{l.label}</button>
              ))}
            </div>
          </div>
          <p className="mt-1 text-[11px] text-faint">🎤 Tap, talk (up to 2 min), tap again — it's written out for you. Mixed Arabic + English works best on “عربي + English”.</p>
          <div className="mb-1.5 mt-3 text-xs text-mute">How do you feel? <span className="text-faint">(optional)</span></div>
          <MoodPicker value={mood} onChange={setMood} />
          <div className="mb-1.5 mt-3 text-xs text-mute">Tags {sugNow && <span className="text-info">· dashed = suggested from your words</span>}</div>
          <TagPicker value={tags} onChange={setTags} text={text} />
          <div className="mt-3 flex gap-2">
            <input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value || today())} className="min-h-12 rounded-xl bg-card2 px-3 text-sm outline-none" aria-label="Date" />
            <Btn kind="primary" className="flex-1" onClick={save} disabled={!text.trim()}>Add entry</Btn>
          </div>
        </div>

        {/* feed */}
        <div>
          <div className="mb-3 rounded-2xl bg-card p-3">
            <div className="flex items-end justify-between gap-1">
              {moodDays.map((d) => (
                <div key={d.iso} className="flex flex-1 flex-col items-center gap-1" title={d.iso}>
                  <span className={cx("text-base leading-none", !d.mood && "opacity-0")}>{d.mood ? MOODS[d.mood - 1] : "·"}</span>
                  <span className={cx("h-1.5 w-1.5 rounded-full", d.iso === today() ? "bg-info" : d.mood ? "bg-acc" : "bg-card3")} />
                </div>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap justify-between gap-x-2 text-[11px] text-mute num">
              <span>Mood · last 14 days</span>
              <span>This month: {stats.entries} entries · {stats.notes} notes{stats.pain ? <> · <span className="text-bad">{stats.pain} pain</span></> : null}</span>
            </div>
          </div>
          <label className="mb-2 flex min-h-12 items-center gap-2 rounded-xl bg-card px-3">
            <Search size={16} className="text-mute" />
            <input type="search" dir="auto" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search — e.g. shoulder / الكتف" className="min-w-0 flex-1 bg-transparent outline-none" />
            {q && <button onClick={() => setQ("")} aria-label="Clear" className="text-mute"><X size={16} /></button>}
          </label>
          <div className="-mx-1 mb-3 overflow-x-auto px-1"><Chips small options={KINDS} value={kind} onChange={setKind} /></div>
          {data && <p className="mb-2 text-[11px] text-faint">{list.length} of {data.length} notes</p>}
          {data && !list.length && <Empty icon={NotebookPen}>{q || kind ? "Nothing matches." : "No notes yet. Write or speak your first one."}</Empty>}
          <div className="space-y-4">
            {groups.map(([d, items]) => (
              <section key={d}>
                <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-mute">{niceDate(d)}</h3>
                <div className="space-y-2">
                  {items.map((n) => {
                    const Icon = ICON[n.kind];
                    const editing = edit?.id === n.id;
                    return (
                      <article key={`${n.kind}:${n.id}`} className="rounded-2xl bg-card p-3.5">
                        <div className="mb-1 flex items-center gap-2 text-xs text-mute">
                          <Icon size={14} className={cx("shrink-0", COLOR[n.kind])} />
                          {n.link ? <a href={`#${n.link}`} className="truncate underline decoration-line underline-offset-2">{n.title}</a> : <span className="truncate">{n.title ?? "Journal"}</span>}
                          {n.mood ? <span title={MOOD_LABEL[n.mood - 1]}>{MOODS[n.mood - 1]}</span> : null}
                          {parseTags(n.tag).map((t) => <span key={t} className={cx("rounded-full px-2 py-0.5", t === "pain" ? "bg-bad/15 text-bad" : t === "win" ? "bg-acc/15 text-acc" : "bg-card2")}>{t}</span>)}
                          {n.pain && <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-bad/15 px-2 py-0.5 text-bad"><TriangleAlert size={11} />{n.pain}</span>}
                          <span className="flex-1" />
                          {n.kind === "journal" && !editing && (
                            <button onClick={() => setEdit({ id: n.id, text: n.text, tags: parseTags(n.tag), mood: n.mood ?? null })} className="-my-3 flex h-11 w-9 shrink-0 items-center justify-center text-faint hover:text-ink" aria-label="Edit"><Pencil size={15} /></button>
                          )}
                        </div>
                        {editing ? (
                          <div>
                            <div className="flex gap-1.5">
                              <textarea dir="auto" autoFocus value={edit.text} onChange={(e) => setEdit({ ...edit, text: e.target.value })} rows={4} className="min-w-0 flex-1 rounded-xl bg-card2 p-3 text-sm outline-none focus:ring-2 focus:ring-acc" />
                              <VoiceButton onText={(t) => setEdit((v) => (v ? { ...v, text: appendText(v.text, t) } : v))} />
                            </div>
                            <div className="mt-2"><MoodPicker value={edit.mood} onChange={(m) => setEdit({ ...edit, mood: m })} /></div>
                            <div className="mt-2"><TagPicker value={edit.tags} onChange={(t) => setEdit({ ...edit, tags: t })} text={edit.text} /></div>
                            <div className="mt-2 grid grid-cols-[auto_1fr_1fr] gap-2">
                              <button onClick={() => del(n.id)} className="flex min-h-11 w-11 items-center justify-center rounded-xl bg-card2 text-bad" aria-label="Delete"><Trash2 size={16} /></button>
                              <Btn kind="soft" onClick={() => setEdit(null)}>Cancel</Btn>
                              <Btn kind="primary" onClick={saveEdit} disabled={!edit.text.trim()}>Save</Btn>
                            </div>
                          </div>
                        ) : (
                          <p dir="auto" className="bidi whitespace-pre-wrap text-sm leading-relaxed"><Hl text={n.text} q={q} /></p>
                        )}
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
