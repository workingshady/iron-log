import { Fragment } from "react";
import { splitMentions } from "../../../shared/social";
import { cx } from "../../lib/util";

/**
 * `className` replaces the link colour (default text-info), e.g. "text-inherit underline" inside chat bubbles.
 * Text with @username shown as links to #/u/<username>. Each mention is its own LTR island (dir="ltr" isolates it), so
 * "@omar" stays readable inside Arabic text. Plain parts are returned as-is (the parent keeps dir="auto" + whitespace rules).
 */
export function MentionText({ text, className, onNavigate }: { text: string; className?: string; onNavigate?: () => void }) {
  return (
    <>
      {splitMentions(text).map((p, i) => ("u" in p ? (
        <a key={i} href={`#/u/${encodeURIComponent(p.u)}`} dir="ltr" onClick={(e) => { e.stopPropagation(); onNavigate?.(); }}
          className={cx("font-semibold hover:underline focus-visible:underline", className ?? "text-info")}>{p.raw}</a>
      ) : <Fragment key={i}>{p.t}</Fragment>))}
    </>
  );
}
