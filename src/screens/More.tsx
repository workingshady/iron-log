import { ChevronRight, LayoutGrid } from "lucide-react";
import { MORE } from "../nav";
import { PageHead } from "../components/ui";

export default function More() {
  return (
    <div>
      <PageHead icon={LayoutGrid} title="More" sub="Daily tracking, benchmarks, notes, help and settings." />
      <div className="space-y-2">
        {MORE.map((m) => (
          <a key={m.path} href={`#${m.path}`} className="flex items-center gap-3 rounded-2xl bg-card p-4 hover:bg-card2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-card2"><m.icon size={20} className={m.path === "/creatine" ? "text-vio" : m.path === "/learn" ? "text-info" : "text-ink"} /></div>
            <div className="min-w-0 flex-1">
              <div className="font-semibold">{m.label}</div>
              <div className="text-xs text-mute">{m.sub}</div>
            </div>
            <ChevronRight size={18} className="text-faint" />
          </a>
        ))}
      </div>
    </div>
  );
}
