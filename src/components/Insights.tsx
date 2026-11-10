import { AlertTriangle, CheckCircle2, Info, TriangleAlert } from "lucide-react";
import type { InsightsData } from "../../shared/api";
import { cx } from "../lib/util";

const TONE = {
  good: { icon: CheckCircle2, c: "text-acc" },
  warn: { icon: TriangleAlert, c: "text-warn" },
  bad: { icon: AlertTriangle, c: "text-bad" },
  info: { icon: Info, c: "text-info" },
};

export function InsightList({ items, max }: { items: InsightsData["insights"]; max?: number }) {
  return (
    <ul className="space-y-2.5">
      {items.slice(0, max).map((x, i) => {
        const T = TONE[x.tone];
        return (
          <li key={i} className="flex gap-3">
            <T.icon size={18} className={cx("mt-0.5 shrink-0", T.c)} />
            <div className="min-w-0">
              <div className="text-sm font-semibold">{x.title}</div>
              <div className="text-sm text-mute">{x.text}</div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
