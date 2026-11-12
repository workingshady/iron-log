import type { ReactNode } from "react";

// Iron Log sticker pack: original gym-themed SVG stickers, stored in messages.sticker by id (never rename an id).
// 120×120 viewBox, die-cut look (white outline + soft shadow), works on any wallpaper.

const F = "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const INK = "#10140a";

function Base({ bg, children, shape = "round" }: { bg: string; children: ReactNode; shape?: "round" | "circle" | "burst" }) {
  return (
    <>
      <defs>
        <filter id="stk-sh" x="-10%" y="-10%" width="120%" height="125%"><feDropShadow dx="0" dy="2" stdDeviation="2" floodOpacity=".35" /></filter>
      </defs>
      <g filter="url(#stk-sh)">
        {shape === "circle" ? <circle cx="60" cy="60" r="52" fill={bg} stroke="#fff" strokeWidth="5" />
          : shape === "burst" ? <path d="M60 6l11 14 17-6 3 18 18 3-6 17 14 11-14 11 6 17-18 3-3 18-17-6-11 14-11-14-17 6-3-18-18-3 6-17L6 60l14-11-6-17 18-3 3-18 17 6z" fill={bg} stroke="#fff" strokeWidth="5" strokeLinejoin="round" />
          : <rect x="7" y="7" width="106" height="106" rx="30" fill={bg} stroke="#fff" strokeWidth="5" />}
      </g>
      {children}
    </>
  );
}

const Dumbbell = ({ x = 0, y = 0, s = 1, c = "#2c2c32", rot = 0 }: { x?: number; y?: number; s?: number; c?: string; rot?: number }) => (
  <g transform={`translate(${x} ${y}) rotate(${rot}) scale(${s})`}>
    <rect x="-30" y="-3.5" width="60" height="7" rx="3" fill="#9b9ba6" />
    <rect x="-30" y="-14" width="10" height="28" rx="3" fill={c} />
    <rect x="-38" y="-10" width="8" height="20" rx="3" fill={c} />
    <rect x="20" y="-14" width="10" height="28" rx="3" fill={c} />
    <rect x="30" y="-10" width="8" height="20" rx="3" fill={c} />
  </g>
);

export const STICKERS: { id: string; label: string; svg: ReactNode }[] = [
  {
    id: "flex", label: "Flex",
    svg: <Base bg="#c8f560">
      <path d="M30 86c0-14 6-22 14-26l6-20c2-6 10-8 14-3l4 6c3 4 1 9-4 10l-8 2-3 9c10-6 24-4 31 5 6 9 3 22-8 26-12 4-30 3-46-9z" fill="#f2c094" stroke={INK} strokeWidth="3.5" strokeLinejoin="round" />
      <path d="M58 62c6-2 14 0 18 5" fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" />
      <path d="M86 36l6-6M92 46h8M80 28l2-8" stroke={INK} strokeWidth="3.5" strokeLinecap="round" />
    </Base>,
  },
  {
    id: "pr", label: "New PR",
    svg: <Base bg="#ffb547" shape="burst">
      <text x="60" y="64" textAnchor="middle" fontFamily={F} fontWeight="900" fontSize="34" fill={INK}>PR!</text>
      <text x="60" y="82" textAnchor="middle" fontFamily={F} fontWeight="800" fontSize="11" fill={INK} letterSpacing="1">NEW RECORD</text>
    </Base>,
  },
  {
    id: "leg-day", label: "Leg day",
    svg: <Base bg="#6cb6ff">
      <path d="M44 24h14l4 30-6 34h10l2 8H40l2-42z" fill="#f2c094" stroke={INK} strokeWidth="3.5" strokeLinejoin="round" />
      <path d="M44 24h14l2 14H44z" fill="#2c2c32" />
      <text x="84" y="52" textAnchor="middle" fontFamily={F} fontWeight="900" fontSize="17" fill={INK}>LEG</text>
      <text x="84" y="72" textAnchor="middle" fontFamily={F} fontWeight="900" fontSize="17" fill={INK}>DAY</text>
      <path d="M72 84c6 4 18 4 24 0" fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" />
    </Base>,
  },
  {
    id: "rest-day", label: "Rest day",
    svg: <Base bg="#b69cff">
      <circle cx="56" cy="64" r="26" fill="#ffd166" stroke={INK} strokeWidth="3.5" />
      <path d="M44 62c3 3 7 3 10 0M60 62c3 3 7 3 10 0" fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" />
      <path d="M50 76c4 3 8 3 12 0" fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" />
      <text x="88" y="40" fontFamily={F} fontWeight="900" fontSize="16" fill="#fff">Z</text>
      <text x="96" y="28" fontFamily={F} fontWeight="900" fontSize="11" fill="#fff">z</text>
      <text x="60" y="104" textAnchor="middle" fontFamily={F} fontWeight="800" fontSize="11" fill={INK}>REST DAY</text>
    </Base>,
  },
  {
    id: "beast-mode", label: "Beast mode",
    svg: <Base bg="#ff7272">
      <path d="M34 40l10 12M86 40L76 52" stroke={INK} strokeWidth="4" strokeLinecap="round" />
      <circle cx="46" cy="58" r="5" fill={INK} /><circle cx="74" cy="58" r="5" fill={INK} />
      <path d="M42 76h36l-6 8-6-6-6 6-6-6-6 6z" fill="#fff" stroke={INK} strokeWidth="3" strokeLinejoin="round" />
      <text x="60" y="104" textAnchor="middle" fontFamily={F} fontWeight="900" fontSize="12" fill={INK}>BEAST MODE</text>
      <path d="M30 26l6 8M90 26l-6 8M60 18v10" stroke="#fff" strokeWidth="4" strokeLinecap="round" />
    </Base>,
  },
  {
    id: "lets-go", label: "Let's go",
    svg: <Base bg="#c8f560">
      <path d="M66 14L34 66h22l-6 40 36-56H64z" fill="#ffd166" stroke={INK} strokeWidth="3.5" strokeLinejoin="round" />
      <text x="60" y="112" textAnchor="middle" fontFamily={F} fontWeight="900" fontSize="13" fill={INK} stroke="#c8f560" strokeWidth="4" paintOrder="stroke">LET'S GO!</text>
    </Base>,
  },
  {
    id: "one-more-rep", label: "One more rep",
    svg: <Base bg="#ffd166">
      <text x="60" y="58" textAnchor="middle" fontFamily={F} fontWeight="900" fontSize="40" fill={INK}>+1</text>
      <text x="60" y="80" textAnchor="middle" fontFamily={F} fontWeight="900" fontSize="12" fill={INK}>ONE MORE</text>
      <text x="60" y="96" textAnchor="middle" fontFamily={F} fontWeight="900" fontSize="12" fill={INK}>REP</text>
    </Base>,
  },
  {
    id: "protein", label: "Protein shake",
    svg: <Base bg="#6cb6ff">
      <path d="M42 36h36l-5 66H47z" fill="#f3f3f5" stroke={INK} strokeWidth="3.5" strokeLinejoin="round" />
      <path d="M44 58h32l-3 44H47z" fill="#a0673e" />
      <rect x="38" y="26" width="44" height="12" rx="4" fill="#2c2c32" stroke={INK} strokeWidth="3" />
      <path d="M54 26V14h12" fill="none" stroke={INK} strokeWidth="4" strokeLinecap="round" />
      <text x="60" y="84" textAnchor="middle" fontFamily={F} fontWeight="900" fontSize="12" fill="#fff">WHEY</text>
    </Base>,
  },
  {
    id: "kettlebell", label: "Kettlebell",
    svg: <Base bg="#9b9ba6" shape="circle">
      <path d="M44 50c-4-22 36-22 32 0" fill="none" stroke="#2c2c32" strokeWidth="9" strokeLinecap="round" />
      <circle cx="60" cy="74" r="26" fill="#2c2c32" stroke={INK} strokeWidth="3" />
      <text x="60" y="80" textAnchor="middle" fontFamily={F} fontWeight="900" fontSize="15" fill="#c8f560">24</text>
      <path d="M44 66c2-5 6-8 10-9" fill="none" stroke="#fff" strokeOpacity=".5" strokeWidth="3" strokeLinecap="round" />
    </Base>,
  },
  {
    id: "gym-love", label: "Gym love",
    svg: <Base bg="#ff9ecf">
      <path d="M60 96L28 64c-10-10-8-26 4-31 9-4 18 0 28 10 10-10 19-14 28-10 12 5 14 21 4 31z" fill="#ff7272" stroke={INK} strokeWidth="3.5" strokeLinejoin="round" />
      <Dumbbell x={60} y={58} s={0.7} c={INK} />
    </Base>,
  },
  {
    id: "pull-up", label: "Pull-up",
    svg: <Base bg="#c8f560">
      <rect x="20" y="22" width="80" height="7" rx="3" fill="#2c2c32" />
      <path d="M46 28l6 18M74 28l-6 18" stroke="#f2c094" strokeWidth="6" strokeLinecap="round" />
      <circle cx="60" cy="40" r="9" fill="#f2c094" stroke={INK} strokeWidth="3" />
      <path d="M48 52h24l-2 26H50z" fill="#2c2c32" />
      <path d="M52 78l-2 22M68 78l2 22" stroke="#2c2c32" strokeWidth="7" strokeLinecap="round" />
      <path d="M86 50l4-6M90 58h6" stroke={INK} strokeWidth="3" strokeLinecap="round" />
    </Base>,
  },
  {
    id: "plate-20", label: "20 kg plate",
    svg: <Base bg="#6cb6ff" shape="circle">
      <circle cx="60" cy="60" r="38" fill="#2f6fd6" stroke={INK} strokeWidth="3" />
      <circle cx="60" cy="60" r="26" fill="none" stroke="#fff" strokeOpacity=".35" strokeWidth="2" />
      <circle cx="60" cy="60" r="8" fill="#f3f3f5" stroke={INK} strokeWidth="3" />
      <text x="60" y="38" textAnchor="middle" fontFamily={F} fontWeight="900" fontSize="12" fill="#fff">20 KG</text>
    </Base>,
  },
  {
    id: "trophy", label: "Champion",
    svg: <Base bg="#ffd166" shape="burst">
      <path d="M42 30h36v14c0 12-8 22-18 22S42 56 42 44z" fill="#ffb547" stroke={INK} strokeWidth="3.5" strokeLinejoin="round" />
      <path d="M42 36H32c0 10 4 16 12 16M78 36h10c0 10-4 16-12 16" fill="none" stroke={INK} strokeWidth="3.5" strokeLinecap="round" />
      <path d="M56 66h8v12h-8z" fill="#ffb547" stroke={INK} strokeWidth="3" />
      <rect x="44" y="78" width="32" height="10" rx="3" fill="#2c2c32" stroke={INK} strokeWidth="3" />
      <text x="60" y="51" textAnchor="middle" fontFamily={F} fontWeight="900" fontSize="14" fill={INK}>1</text>
    </Base>,
  },
  {
    id: "sweat", label: "Dead tired",
    svg: <Base bg="#ff7272">
      <circle cx="60" cy="58" r="30" fill="#ffd166" stroke={INK} strokeWidth="3.5" />
      <path d="M44 50l8 6-8 6M76 50l-8 6 8 6" fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <ellipse cx="60" cy="74" rx="8" ry="6" fill={INK} />
      <path d="M88 30c4 6 6 9 6 12a6 6 0 01-12 0c0-3 2-6 6-12z" fill="#6cb6ff" stroke={INK} strokeWidth="2.5" />
      <text x="60" y="106" textAnchor="middle" fontFamily={F} fontWeight="900" fontSize="11" fill={INK}>I'M DEAD</text>
    </Base>,
  },
  {
    id: "streak", label: "On fire",
    svg: <Base bg="#2c2c32">
      <path d="M60 18c4 16 22 22 22 46a22 22 0 01-44 0c0-12 6-18 10-24 2 8 6 10 8 10-2-12 0-22 4-32z" fill="#ffb547" stroke="#ff7272" strokeWidth="4" strokeLinejoin="round" />
      <path d="M60 58c2 6 10 10 10 18a10 10 0 01-20 0c0-6 6-10 10-18z" fill="#ffd166" />
      <text x="60" y="106" textAnchor="middle" fontFamily={F} fontWeight="900" fontSize="12" fill="#ffb547">STREAK</text>
    </Base>,
  },
  {
    id: "no-excuses", label: "No excuses",
    svg: <Base bg="#f3f3f5">
      <text x="60" y="52" textAnchor="middle" fontFamily={F} fontWeight="900" fontSize="20" fill={INK}>NO</text>
      <text x="60" y="76" textAnchor="middle" fontFamily={F} fontWeight="900" fontSize="15" fill="#ff7272">EXCUSES</text>
      <path d="M26 88h68" stroke={INK} strokeWidth="4" strokeLinecap="round" />
      <path d="M30 26h60" stroke="#c8f560" strokeWidth="6" strokeLinecap="round" />
    </Base>,
  },
  {
    id: "pre-workout", label: "Pre-workout",
    svg: <Base bg="#b69cff">
      <path d="M38 44h38v34c0 10-8 18-19 18s-19-8-19-18z" fill="#f3f3f5" stroke={INK} strokeWidth="3.5" strokeLinejoin="round" />
      <path d="M76 52h6a9 9 0 010 18h-6" fill="none" stroke={INK} strokeWidth="3.5" />
      <path d="M48 34c-4-6 4-8 0-14M58 34c-4-6 4-8 0-14M68 34c-4-6 4-8 0-14" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
      <path d="M57 54l-6 12h8l-4 12 12-16h-8l4-8z" fill="#ffb547" stroke={INK} strokeWidth="2" strokeLinejoin="round" />
    </Base>,
  },
  {
    id: "deadlift", label: "Deadlift",
    svg: <Base bg="#ffb547">
      <circle cx="60" cy="30" r="9" fill="#f2c094" stroke={INK} strokeWidth="3" />
      <path d="M60 40v28M60 48l-12 26M60 48l12 26M60 68l-10 26M60 68l10 26" stroke="#2c2c32" strokeWidth="7" strokeLinecap="round" />
      <Dumbbell x={60} y={76} s={1.3} c={INK} />
    </Base>,
  },
  {
    id: "spot-me", label: "Spot me",
    svg: <Base bg="#c8f560" shape="circle">
      <path d="M30 70c8-6 16-6 22 0l8 8 8-8c6-6 14-6 22 0" fill="none" stroke={INK} strokeWidth="5" strokeLinecap="round" />
      <path d="M38 56c0-10 10-12 14-4M82 56c0-10-10-12-14-4" fill="none" stroke={INK} strokeWidth="4" strokeLinecap="round" />
      <text x="60" y="42" textAnchor="middle" fontFamily={F} fontWeight="900" fontSize="15" fill={INK}>SPOT ME</text>
      <text x="60" y="100" textAnchor="middle" fontFamily={F} fontWeight="900" fontSize="20" fill={INK}>🤝</text>
    </Base>,
  },
  {
    id: "gains", label: "Gains",
    svg: <Base bg="#2c2c32">
      <path d="M22 92l22-22 14 12 32-38" fill="none" stroke="#c8f560" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M74 40h18v18" fill="none" stroke="#c8f560" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      <text x="40" y="38" textAnchor="middle" fontFamily={F} fontWeight="900" fontSize="15" fill="#fff">GAINS</text>
    </Base>,
  },
];

export const stickerById = (id: string | null | undefined) => STICKERS.find((s) => s.id === id);

export function Sticker({ id, size = 128, className }: { id: string; size?: number; className?: string }) {
  const s = stickerById(id);
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} className={className} role="img" aria-label={`Sticker: ${s?.label ?? id}`}>
      {s ? s.svg : <text x="60" y="66" textAnchor="middle" fontSize="14" fill="#9b9ba6">sticker</text>}
    </svg>
  );
}
