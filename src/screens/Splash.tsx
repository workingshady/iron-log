/**
 * Launch splash: the Iron Log mark "lifts" (bar → plates → up-chevron draws on), ~1 s, then the chevron breathes while
 * /api/me is still loading. index.html paints the SAME markup + CSS on first paint (no blank screen); this component
 * continues the animation where it is (negative delay = time since page start) instead of restarting it.
 * Never adds waiting time: render it only while something is actually loading.
 * prefers-reduced-motion → static mark, no movement.
 */

import { useState } from "react";

// Keep in sync with the inline copy in index.html (#boot).
export const SPLASH_CSS = `
.ils{position:fixed;inset:0;z-index:60;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;background:#111113;color:#9b9ba6}
.ils svg{width:112px;height:108px;overflow:visible}
.ils *{transform-box:view-box}
.ils .b{transform-origin:50px 66.5px;animation:ils-x .34s cubic-bezier(.2,.8,.2,1);--d:0ms}
.ils .p1{transform-origin:50px 66.5px;animation:ils-y .32s cubic-bezier(.3,1.5,.55,1);--d:180ms}
.ils .p2{transform-origin:50px 66.5px;animation:ils-y .3s cubic-bezier(.3,1.5,.55,1);--d:280ms}
.ils .lift{animation:ils-lift .42s cubic-bezier(.3,1.25,.5,1);--d:480ms}
.ils .chev{stroke-dasharray:50;animation:ils-draw .38s cubic-bezier(.4,0,.2,1) both,ils-breathe 1.6s ease-in-out 1.5s infinite;animation-delay:calc(560ms - var(--il-t,0ms)),calc(1500ms - var(--il-t,0ms))}
.ils .glow{animation:ils-fade .6s ease-out;--d:650ms}
.ils .word{font:600 12px/1 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;letter-spacing:.42em;padding-left:.42em;animation:ils-fade .5s ease-out;--d:720ms}
.ils .b,.ils .p1,.ils .p2,.ils .lift,.ils .glow,.ils .word{animation-fill-mode:both;animation-delay:calc(var(--d,0ms) - var(--il-t,0ms))}
@keyframes ils-x{from{transform:scaleX(0)}to{transform:none}}
@keyframes ils-y{from{transform:scaleY(0)}to{transform:none}}
@keyframes ils-lift{from{transform:translateY(9px)}to{transform:none}}
@keyframes ils-draw{from{stroke-dashoffset:50;transform:translateY(6px)}to{stroke-dashoffset:0;transform:none}}
@keyframes ils-breathe{0%,100%{opacity:1}50%{opacity:.55}}
@keyframes ils-fade{from{opacity:0}to{opacity:1}}
@media (prefers-reduced-motion:reduce){.ils *{animation:none!important}}
`;

const BAR = "M5 61h90a3 3 0 0 1 3 3v5a3 3 0 0 1 -3 3h-90a3 3 0 0 1 -3 -3v-5a3 3 0 0 1 3 -3z";
const BIG = "M19.5 37h7a4.5 4.5 0 0 1 4.5 4.5v50a4.5 4.5 0 0 1 -4.5 4.5h-7a4.5 4.5 0 0 1 -4.5 -4.5v-50a4.5 4.5 0 0 1 4.5 -4.5zM73.5 37h7a4.5 4.5 0 0 1 4.5 4.5v50a4.5 4.5 0 0 1 -4.5 4.5h-7a4.5 4.5 0 0 1 -4.5 -4.5v-50a4.5 4.5 0 0 1 4.5 -4.5z";
const SMALL = "M9 48h5a4 4 0 0 1 4 4v29a4 4 0 0 1 -4 4h-5a4 4 0 0 1 -4 -4v-29a4 4 0 0 1 4 -4zM86 48h5a4 4 0 0 1 4 4v29a4 4 0 0 1 -4 4h-5a4 4 0 0 1 -4 -4v-29a4 4 0 0 1 4 -4z";

/** The animated mark on its own (also usable small, e.g. a loading state). */
export function LiftMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 2 100 96" className={className} aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id="ils-g" cx=".5" cy=".55" r=".5">
          <stop offset="0" stopColor="#c8f560" stopOpacity=".22" />
          <stop offset="1" stopColor="#c8f560" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle className="glow" cx="50" cy="52" r="62" fill="url(#ils-g)" />
      <g className="lift" fill="#c8f560">
        <path className="b" d={BAR} />
        <path className="p1" d={BIG} />
        <path className="p2" d={SMALL} />
      </g>
      <path className="chev" d="M33 28 50 11 67 28" fill="none" stroke="#c8f560" strokeWidth="13" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** When the inline splash in index.html started (set there); falls back to page start. */
const t0 = () => (window as unknown as { __ilT0?: number }).__ilT0 ?? 0;

export default function Splash({ label = "Loading Iron Log…" }: { label?: string }) {
  // time since the page started: the inline splash in index.html began at ~0, so continue from there
  const [t] = useState(() => Math.max(0, performance.now() - t0())); // frozen: re-renders must not move the animation
  return (
    <div className="ils" role="status" aria-live="polite" style={{ ["--il-t" as string]: `${Math.round(t)}ms` }}>
      <style>{SPLASH_CSS}</style>
      <LiftMark />
      <span className="word" aria-hidden="true">IRON LOG</span>
      <span className="sr-only">{label}</span>
    </div>
  );
}
