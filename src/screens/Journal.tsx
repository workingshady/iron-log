import { useState } from "react";
import { NotebookPen, Trash2 } from "lucide-react";
import { send, track, uid } from "../lib/api";
import { useLoad } from "../lib/useLoad";
import { niceDate, today } from "../lib/util";
import { Btn, Chips, Empty, PageHead } from "../components/ui";

type J = { id: string; date: string; text: string; tags: string | null };
const TAGS = ["win", "struggle", "pain", "life", "food", "sleep", "idea"];

export default function Journal() {
  const { data, reload } = useLoad<J[]>("/journal");
  const [text, setText] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [filter, setFilter] = useState<string | null>(null);

  async function save() {
    if (!text.trim()) return;
    await send("POST", "/journal", { id: uid(), date: today(), text: text.trim(), tags: tag });
    track("journal_add", { tag });
    setText("");
    setTag(null);
    reload();
  }
  async function del(id: string) {
    if (!confirm("Delete this entry?")) return;
    await send("DELETE", `/journal/${id}`);
    reload();
  }
  const list = (data ?? []).filter((j) => !filter || j.tags === filter);

  return (
    <div>
      <PageHead icon={NotebookPen} title="Journal" sub="Your story in your own words: wins, struggles, pain, life stuff. The monthly review reads this for context." />
      <div className="grid gap-4 md:grid-cols-[1fr_1.3fr]">
        <div className="rounded-2xl bg-card p-4 md:self-start">
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} placeholder="e.g. Work was crazy this week, slept 5 h, still hit Pull day. Left shoulder better." className="w-full rounded-xl bg-card2 p-3 outline-none focus:ring-2 focus:ring-acc" />
          <div className="mt-3"><Chips small options={TAGS.map((t) => ({ id: t, label: t }))} value={tag} onChange={setTag} /></div>
          <Btn kind="primary" className="mt-3 w-full" onClick={save} disabled={!text.trim()}>Add entry</Btn>
        </div>
        <div>
          <div className="mb-3"><Chips small options={TAGS.map((t) => ({ id: t, label: t }))} value={filter} onChange={setFilter} /></div>
          {!list.length && <Empty icon={NotebookPen}>No entries yet.</Empty>}
          <div className="space-y-2">
            {list.map((j) => (
              <article key={j.id} className="rounded-2xl bg-card p-4">
                <div className="mb-1 flex items-center gap-2 text-xs text-mute">
                  <span>{niceDate(j.date)}</span>
                  {j.tags && <span className="rounded-full bg-card2 px-2 py-0.5">{j.tags}</span>}
                  <span className="flex-1" />
                  <button onClick={() => del(j.id)} className="text-faint hover:text-bad" aria-label="Delete"><Trash2 size={14} /></button>
                </div>
                <p className="whitespace-pre-wrap text-sm">{j.text}</p>
              </article>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
