import { useEffect, useState } from "react";
import { ChevronLeft, Flag, Swords, Trophy } from "lucide-react";
import { Leaderboard } from "../components/social/Leaderboard";
import { LiftCompare } from "../components/social/LiftCompare";
import { Challenges } from "../components/social/Challenges";
import { cx } from "../lib/util";


type Tab = "board" | "lifts" | "challenges";
const TABS: { id: Tab; label: string; icon: typeof Trophy }[] = [
  { id: "board", label: "Board", icon: Trophy },
  { id: "lifts", label: "Lifts", icon: Swords },
  { id: "challenges", label: "Challenges", icon: Flag },
];

/** Leaderboard · who lifts more · challenges. Friends who opted in, any plan. */
export default function Compete() {
  const [tab, setTab] = useState<Tab>(() => (sessionStorage.getItem("il:compete") as Tab) || "board");
  useEffect(() => { try { sessionStorage.setItem("il:compete", tab); } catch { /* ignore */ } }, [tab]);
  return (
    <div className="overflow-x-clip md:mx-auto md:max-w-xl">
      <header className="-ml-2 mb-3 flex items-center gap-1">
        <button type="button" onClick={() => history.back()} className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-card2" aria-label="Back"><ChevronLeft size={26} aria-hidden /></button>
        <h1 className="flex-1 text-[26px] font-extrabold tracking-tight">Compete</h1>
      </header>
      <div role="tablist" aria-label="Compete" className="mb-4 flex rounded-2xl bg-card p-1">
        {TABS.map((x) => (
          <button key={x.id} role="tab" aria-selected={tab === x.id} onClick={() => setTab(x.id)}
            className={cx("flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl text-sm transition-colors", tab === x.id ? "bg-card3 font-semibold text-ink" : "text-mute")}>
            <x.icon size={16} aria-hidden />{x.label}
          </button>
        ))}
      </div>
      <div role="tabpanel">{tab === "board" ? <Leaderboard /> : tab === "lifts" ? <LiftCompare /> : <Challenges />}</div>
    </div>
  );
}
