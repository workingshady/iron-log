import { useEffect, useMemo, useRef, useState } from "react";
import {
  AtSign, Move, CalendarRange, Camera, Check, Columns2, Dumbbell, Grid3x3, ImagePlus, KeyRound, Loader2, Menu, NotebookPen, PersonStanding, Settings, Trash2, TrendingUp, Trophy, UserRound, Wrench,
} from "lucide-react";
import { get, isDev, send, track } from "../lib/api";
import { useLoad } from "../lib/useLoad";
import { refreshMe } from "../lib/me";
import { cx, niceDate } from "../lib/util";
import { Btn, Chips, Empty, NumInput, Sheet } from "../components/ui";
import type { AppState } from "../../shared/api";
import { Avatar } from "../components/Avatar";
import { FriendsCount } from "../components/social/Badges";
import { Lightbox, NewPhotoSheet, PhotoGrid, PhotoImg, photoUrl, uploadPhoto, type PhotoMeta } from "../components/Photos";
import { PhotoEditor, type Edited } from "../components/PhotoEditor";

interface Profile { id: string; username: string; name: string | null; bio: string | null; avatarId: string | null; createdAt: number; stats: { workouts: number; photos: number; prs: number; since: string | null } }

const TABS = [
  { id: "all", label: "All photos", icon: Grid3x3, kinds: null },
  { id: "progress", label: "Progress", icon: TrendingUp, kinds: ["progress"] },
  { id: "form", label: "Form", icon: Dumbbell, kinds: ["set", "session"] },
  { id: "machine", label: "Machines", icon: Wrench, kinds: ["exercise"] },
  { id: "journal", label: "Journal", icon: NotebookPen, kinds: ["journal", "other"] },
] as const;
type Tab = (typeof TABS)[number]["id"];

/** Story-highlight style shortcuts (the pages you open most from here). */
const HIGHLIGHTS = [
  { href: "#/months", label: "Months", icon: CalendarRange },
  { href: "#/stats", label: "PRs", icon: Trophy },
  { href: "#/body", label: "Body", icon: PersonStanding },
  { href: "#/journal", label: "Journal", icon: NotebookPen },
];

const since = (d: string | null) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { month: "short", year: "numeric" }) : null);

export default function Profile() {
  const { data: me, reload: reloadMe } = useLoad<Profile>("/profile");
  const { data: photos, reload } = useLoad<PhotoMeta[]>("/photos");
  const [tab, setTab] = useState<Tab>(() => (sessionStorage.getItem("il:ptab") as Tab) || "all");
  const [open, setOpen] = useState<number | null>(null);
  const [newFile, setNewFile] = useState<File | null>(null); // picked → editor
  const [edited, setEdited] = useState<Edited | null>(null); // editor → caption sheet
  const [editing, setEditing] = useState(false);
  const [avatarSheet, setAvatarSheet] = useState(false);
  const [compare, setCompare] = useState(false);
  const pick = useRef<HTMLInputElement>(null);

  useEffect(() => { try { sessionStorage.setItem("il:ptab", tab); } catch { /* ignore */ } }, [tab]);
  const all = useMemo(() => (photos ?? []).filter((p) => p.refKind !== "avatar"), [photos]);
  const kinds = TABS.find((x) => x.id === tab)!.kinds as readonly string[] | null;
  const shown = useMemo(() => (kinds ? all.filter((p) => kinds.includes(p.refKind)) : all), [all, kinds]);
  const progress = useMemo(() => all.filter((p) => p.refKind === "progress"), [all]);
  const refresh = () => { reload(); reloadMe(); refreshMe(); };

  if (!me) return <div className="py-20 text-center text-mute" role="status">Loading profile…</div>;

  return (
    <div className="-mx-4 md:mx-auto md:max-w-2xl">
      {/* top bar: @username · new photo · all pages · settings (Instagram order) */}
      <header className="-mr-2 flex items-center gap-0.5 pb-3 pl-4 pr-4">
        <h1 className="flex min-w-0 flex-1 items-center gap-1 text-xl font-bold">
          <span className="truncate">{me.username}</span>
          {isDev() && <span className="rounded bg-warn px-1.5 text-[10px] font-bold text-black">DEV</span>}
        </h1>
        <button type="button" onClick={() => pick.current?.click()} className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-card2" aria-label="New photo"><ImagePlus size={24} aria-hidden /></button>
        <a href="#/more" className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-card2" aria-label="All pages"><Menu size={24} aria-hidden /></a>
        <a href="#/settings" className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-card2" aria-label="Settings"><Settings size={24} aria-hidden /></a>
      </header>
      <input ref={pick} type="file" accept="image/*" className="hidden" onChange={(e) => { setNewFile(e.target.files?.[0] ?? null); e.target.value = ""; }} />

      {/* avatar + stats */}
      <section className="flex items-center gap-6 px-4 md:gap-10" aria-label="Profile">
        <button type="button" onClick={() => setAvatarSheet(true)} className="relative rounded-full focus-visible:ring-2 focus-visible:ring-acc" aria-label={me.avatarId ? "Change profile photo" : "Add profile photo"}>
          <Avatar id={me.avatarId} name={me.name ?? me.username} size={86} ring={!!me.avatarId} />
          <span className="absolute -bottom-0.5 -right-0.5 flex h-7 w-7 items-center justify-center rounded-full border-2 border-bg bg-acc text-acc-ink" aria-hidden><Camera size={14} /></span>
        </button>
        <dl className="grid flex-1 grid-cols-3 text-center">
          {[["Workouts", me.stats.workouts], ["PRs", me.stats.prs], ["Photos", me.stats.photos]].map(([l, v]) => (
            <div key={l} className="flex flex-col-reverse items-center gap-0.5">
              <dt className="text-xs text-mute">{l}</dt>
              <dd className="text-lg font-bold leading-none num">{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* name · bio · since */}
      <div className="mt-3 px-4">
        <div className="text-[15px] font-semibold leading-tight">{me.name || me.username}</div>
        {me.bio && <p dir="auto" className="bidi mt-0.5 whitespace-pre-wrap text-sm leading-snug">{me.bio}</p>}
        {me.stats.since && <p className="mt-0.5 text-xs text-mute">Training since {since(me.stats.since)}</p>}
        <FriendsCount className="mt-1.5" />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 px-4">
        <button type="button" onClick={() => setEditing(true)} className="flex h-10 items-center justify-center rounded-lg bg-card2 text-sm font-semibold hover:bg-card3 active:bg-card3">Edit profile</button>
        <button type="button" onClick={() => pick.current?.click()} className="flex h-10 items-center justify-center gap-1.5 rounded-lg bg-card2 text-sm font-semibold hover:bg-card3 active:bg-card3"><ImagePlus size={16} aria-hidden />Add photo</button>
      </div>

      {/* highlights */}
      <nav aria-label="Shortcuts" className="mt-5 px-4">
        <ul className="grid grid-cols-4 gap-2 md:flex md:gap-8">
          {HIGHLIGHTS.map((h) => (
            <li key={h.href} className="flex justify-center">
              <a href={h.href} className="group flex flex-col items-center gap-1.5 rounded-xl text-xs text-ink focus-visible:ring-2 focus-visible:ring-acc">
                <span className="rounded-full border border-line p-[3px] transition-colors group-hover:border-mute" aria-hidden>
                  <span className="flex h-14 w-14 items-center justify-center rounded-full bg-card2"><h.icon size={22} strokeWidth={1.8} /></span>
                </span>
                {h.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {/* tabs (icons, like Instagram) */}
      <div role="tablist" aria-label="Photo types" className="sticky top-0 z-10 mt-5 flex border-b border-line bg-bg">
        {TABS.map((x) => {
          const on = tab === x.id;
          const count = x.kinds ? all.filter((p) => (x.kinds as readonly string[]).includes(p.refKind)).length : all.length;
          return (
            <button key={x.id} role="tab" aria-selected={on} aria-controls="ptab" id={`ptab-${x.id}`} onClick={() => setTab(x.id)} title={x.label}
              className={cx("-mb-px flex h-12 flex-1 items-center justify-center border-b-2 transition-colors", on ? "border-ink text-ink" : "border-transparent text-faint hover:text-mute")}>
              <x.icon size={22} strokeWidth={on ? 2.4 : 1.8} aria-hidden />
              <span className="sr-only">{x.label} ({count})</span>
            </button>
          );
        })}
      </div>

      <div id="ptab" role="tabpanel" aria-labelledby={`ptab-${tab}`} className="pb-4">
        {tab === "progress" && progress.length >= 2 && (
          <div className="flex justify-end px-4 py-2"><Btn kind="ghost" icon={Columns2} onClick={() => setCompare(true)}>Compare first vs latest</Btn></div>
        )}
        {shown.length ? (
          <PhotoGrid photos={shown} onOpen={setOpen} />
        ) : (
          <div className="px-4 pt-6">
            <Empty icon={Camera}>
              {tab === "progress" ? "No progress photos yet. One every 2-4 weeks, same light and pose, shows change the scale misses." : tab === "machine" ? "Machine photos come from an exercise's sheet (seat / pin settings)." : tab === "form" ? "Form photos come from a set's edit sheet during a workout." : "No photos yet."}
            </Empty>
            {(tab === "all" || tab === "progress") && <Btn kind="primary" icon={ImagePlus} className="mx-auto mt-3 flex" onClick={() => pick.current?.click()}>Add a photo</Btn>}
          </div>
        )}
      </div>

      {open != null && <Lightbox items={shown} start={open} onClose={() => setOpen(null)} onChanged={refresh} />}
      {newFile && !edited && <PhotoEditor src={newFile} defaultAspect="4:5" onCancel={() => setNewFile(null)} onDone={setEdited} />}
      <NewPhotoSheet file={edited} onBack={() => setEdited(null)} onClose={() => { setEdited(null); setNewFile(null); }} onDone={() => { setEdited(null); setNewFile(null); setTab((t) => (t === "all" ? t : "progress")); refresh(); }} />
      {editing && <EditProfile me={me} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); refresh(); }} onPhoto={() => setAvatarSheet(true)} />}
      {avatarSheet && <AvatarSheet me={me} photos={all} onClose={() => setAvatarSheet(false)} onDone={() => { setAvatarSheet(false); refresh(); }} />}
      {compare && <CompareSheet photos={progress} onClose={() => setCompare(false)} />}
    </div>
  );
}

// ---------------------------------------------------------------- edit profile

function EditProfile({ me, onClose, onSaved, onPhoto }: { me: Profile; onClose: () => void; onSaved: () => void; onPhoto: () => void }) {
  const [name, setName] = useState(me.name ?? "");
  const [username, setUsername] = useState(me.username);
  const [bio, setBio] = useState(me.bio ?? "");
  const [check, setCheck] = useState<{ available: boolean; reason: string | null } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const u = username.trim().toLowerCase().replace(/^@/, "");
  // training basics (used for starting weights + cardio calories) live in settings
  const { data: st } = useLoad<AppState>("/state");
  const [basics, setBasics] = useState<{ height: string; weight: string; level: string } | null>(null);
  const b0 = st ? { height: st.settings.heightCm ?? "", weight: st.settings.bodyKg ?? "", level: st.settings.level ?? "returning" } : null;
  const bx = basics ?? b0;

  // live "is this username free?" (debounced)
  useEffect(() => {
    if (u === me.username) { setCheck(null); return; }
    const tm = setTimeout(() => get<{ available: boolean; reason: string | null }>(`/users/check?u=${encodeURIComponent(u)}`).then(setCheck).catch(() => setCheck(null)), 400);
    return () => clearTimeout(tm);
  }, [u, me.username]);

  const basicsChanged = !!(basics && b0 && JSON.stringify(basics) !== JSON.stringify(b0));
  const changed = name !== (me.name ?? "") || u !== me.username || bio !== (me.bio ?? "") || basicsChanged;
  async function save() {
    setBusy(true); setErr(null);
    try {
      if (basics && basicsChanged) {
        const h = Number(basics.height || 0), w = Number(basics.weight || 0);
        if ((h && (h < 120 || h > 230)) || (w && (w < 35 || w > 250))) throw new Error("Check height (120-230 cm) and weight (35-250 kg)");
        await Promise.all([["heightCm", basics.height], ["bodyKg", basics.weight], ["level", basics.level]].map(([k, v]) => send("PUT", `/settings/${k}`, { value: v })));
      }
      await send("PUT", "/profile", { name, username: u, bio });
      track("profile_edit", { username: u !== me.username });
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open onClose={onClose} title="Edit profile" icon={UserRound}>
      <div className="flex flex-col items-center gap-2">
        <Avatar id={me.avatarId} name={name || me.username} size={80} />
        <button type="button" onClick={onPhoto} className="min-h-11 px-3 text-sm font-semibold text-info">{me.avatarId ? "Change profile photo" : "Add profile photo"}</button>
      </div>

      <Field label="Name" hint={`${name.length}/40`}>
        <input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} autoComplete="name" dir="auto" className={INPUT} />
      </Field>
      <Field label="Username" hint="unique · friends will find you by it">
        <div className="relative">
          <AtSign size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" aria-hidden />
          <input value={username} maxLength={31} onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s/g, ""))} autoComplete="username" autoCapitalize="none" spellCheck={false}
            aria-invalid={check ? !check.available : undefined} aria-describedby="uname-status" className={cx(INPUT, "pl-9")} />
        </div>
        <p id="uname-status" aria-live="polite" className={cx("mt-1 text-[11px]", check ? (check.available ? "text-acc" : "text-bad") : "text-faint")}>
          {check ? (check.available ? "✓ Available" : check.reason ?? "Not available") : "Letters, numbers, . and _ · 3-30 characters"}
        </p>
      </Field>
      <Field label="Bio" hint={`${bio.length}/150`}>
        <textarea value={bio} maxLength={150} onChange={(e) => setBio(e.target.value)} rows={3} dir="auto" placeholder="e.g. Cairo · chasing my first strict pull-up · wrestler neck in progress" className={cx(INPUT, "py-2")} />
      </Field>

      {bx && (
        <fieldset className="mt-4 rounded-xl border border-line p-3">
          <legend className="px-1 text-[11px] font-semibold uppercase tracking-wide text-mute">Training info</legend>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Height (cm)"><NumInput value={bx.height} onChange={(v) => setBasics({ ...bx, height: v })} /></Field>
            <Field label="Bodyweight (kg)"><NumInput value={bx.weight} onChange={(v) => setBasics({ ...bx, weight: v })} /></Field>
          </div>
          <div className="mt-3 text-[11px] text-mute">Background</div>
          <Chips small clearable={false} options={[{ id: "new", label: "New" }, { id: "returning", label: "Returning" }, { id: "regular", label: "1y+" }]} value={bx.level} onChange={(v) => setBasics({ ...bx, level: v ?? "returning" })} />
          <p className="mt-2 text-[11px] text-faint">Used for starting weights and cardio calories until you log weigh-ins.</p>
        </fieldset>
      )}

      <a href="#/body" onClick={onClose} className="mt-3 flex min-h-12 items-center gap-3 rounded-xl bg-card2 px-3 text-sm">
        <PersonStanding size={18} className="text-mute" aria-hidden /><span className="flex-1">Body info · weight, waist, sleep</span><span className="text-faint" aria-hidden>›</span>
      </a>

      {err && <p role="alert" className="mt-2 text-sm text-bad">{err}</p>}
      <Btn kind="primary" icon={busy ? Loader2 : Check} className="mt-4 w-full" disabled={!changed || busy || (check != null && !check.available)} onClick={save}>Save</Btn>

      <a href="#/security" onClick={onClose} className="mt-5 flex min-h-12 items-center gap-3 border-t border-line pt-3 text-sm font-semibold">
        <KeyRound size={16} className="text-mute" aria-hidden /><span className="flex-1">Passcode, Google sign-in, invites</span><span className="text-faint" aria-hidden>›</span>
      </a>
    </Sheet>
  );
}

const INPUT = "min-h-11 w-full rounded-xl bg-card2 px-3 text-sm text-ink outline-none focus:ring-2 focus:ring-acc";
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="mt-3 block">
      <span className="mb-1 flex justify-between text-[11px] text-mute"><span>{label}</span>{hint && <span className="text-faint num">{hint}</span>}</span>
      {children}
    </label>
  );
}

// ---------------------------------------------------------------- profile photo: new / pick existing / remove

function AvatarSheet({ me, photos, onClose, onDone }: { me: Profile; photos: PhotoMeta[]; onClose: () => void; onDone: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [choose, setChoose] = useState(false);
  const [crop, setCrop] = useState<File | string | null>(null); // a new file or an existing photo's URL → round cropper
  async function set(id: string | null) {
    await send("PUT", "/profile", { avatarId: id });
    track("avatar_set", { remove: !id });
    onDone();
  }
  async function upload(x: Edited) {
    setCrop(null); setBusy(true); setErr(null);
    try { await set(await uploadPhoto(x, { refKind: "avatar" })); }
    catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }
  return (
    <Sheet open onClose={onClose} title="Profile photo" icon={Camera}>
      <div className="mb-3 flex justify-center"><Avatar id={me.avatarId} name={me.name ?? me.username} size={96} /></div>
      <p className="mb-3 text-center text-[11px] text-faint">The centre square of the photo is used. Only you see it.</p>
      <div className="space-y-2">
        <Btn kind="primary" icon={busy ? Loader2 : Camera} className="w-full" disabled={busy} onClick={() => input.current?.click()}>{busy ? "Saving…" : "New photo"}</Btn>
        {me.avatarId && <Btn kind="soft" icon={Move} className="w-full" onClick={() => setCrop(photoUrl(me.avatarId!))}>Adjust current photo</Btn>}
        {photos.length > 0 && <Btn kind="soft" icon={Grid3x3} className="w-full" onClick={() => setChoose(!choose)}>Choose from your photos</Btn>}
        {choose && (
          <ul className="grid grid-cols-4 gap-1">
            {photos.slice(0, 40).map((p) => (
              <li key={p.id}><button type="button" onClick={() => setCrop(photoUrl(p.id))} className="block aspect-square w-full overflow-hidden rounded-lg bg-card3" aria-label={`Use photo from ${niceDate(p.date)}`}><PhotoImg id={p.id} /></button></li>
            ))}
          </ul>
        )}
        {me.avatarId && <Btn kind="danger" icon={Trash2} className="w-full" onClick={() => set(null)}>Remove current photo</Btn>}
      </div>
      {err && <p role="alert" className="mt-2 text-sm text-bad">{err}</p>}
      <input ref={input} type="file" accept="image/*" className="hidden" onChange={(e) => { setCrop(e.target.files?.[0] ?? null); e.target.value = ""; }} />
      {crop && <PhotoEditor src={crop} mode="avatar" onCancel={() => setCrop(null)} onDone={upload} />}
    </Sheet>
  );
}

// ---------------------------------------------------------------- side-by-side progress

function CompareSheet({ photos, onClose }: { photos: PhotoMeta[]; onClose: () => void }) {
  const sorted = [...photos].sort((a, b) => (a.date < b.date ? -1 : 1));
  const [a, setA] = useState(0);
  const [b, setB] = useState(sorted.length - 1);
  const days = Math.round((new Date(sorted[b].date).getTime() - new Date(sorted[a].date).getTime()) / 86400000);
  const Pick = ({ v, on }: { v: number; on: (n: number) => void }) => (
    <select value={v} onChange={(e) => on(Number(e.target.value))} className="mt-1 min-h-11 w-full rounded-xl bg-card2 px-2 text-xs text-ink" aria-label="Photo date">
      {sorted.map((p, k) => <option key={p.id} value={k}>{niceDate(p.date)}</option>)}
    </select>
  );
  return (
    <Sheet open onClose={onClose} title={`Progress · ${days} days apart`} icon={Columns2}>
      <div className="grid grid-cols-2 gap-2">
        {[[a, setA], [b, setB]].map(([v, on], k) => {
          const p = sorted[v as number];
          return (
            <figure key={k}>
              <img src={`/api/photos/${p.id}/img`} alt={`Progress photo ${niceDate(p.date)}`} className="aspect-[3/4] w-full rounded-xl bg-black object-cover" />
              <figcaption className="mt-1 text-center text-[11px] text-mute">{k ? "After" : "Before"}{p.caption ? ` · ${p.caption}` : ""}</figcaption>
              <Pick v={v as number} on={on as (n: number) => void} />
            </figure>
          );
        })}
      </div>
    </Sheet>
  );
}
