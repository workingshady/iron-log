import {
  BarChart3, Bell, Gauge, CalendarRange, BookOpen, CalendarDays, FlaskConical, Footprints, HandFist, History, House, LayoutGrid, Library, ListChecks, LockKeyhole, MessagesSquare, NotebookPen, PersonStanding, Settings, Shield, Target, Trophy, UserRound, Users, Newspaper,
  type LucideIcon,
} from "lucide-react";

export const go = (path: string) => (location.hash = path);

export type NavGroup = "social" | "daily" | "train" | "learn" | "app";

export interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
  sub: string; // one short line: what this page is for
  group?: NavGroup;
  /** Icon colour, only when the page owns a meaning colour (vio = creatine, info = cardio/learn). */
  tone?: "info" | "vio" | "warn";
  /** Only shown to the owner (role "owner"). */
  ownerOnly?: boolean;
}

/**
 * Main pages (bottom bar on phones, top of the sidebar on desktop): 5 destinations max (Material 3 / Hick's law).
 * User stories: "train today" → Home · "what's my plan" → Plan · "what are my friends doing / chat" → Social ·
 * "am I improving" → Stats · "me, my photos, everything else" → You (profile; its ≡ menu = all pages).
 */
export const MAIN: NavItem[] = [
  { path: "/", label: "Home", icon: House, sub: "Next workout, streak and this week at a glance" },
  { path: "/plan", label: "Plan", icon: CalendarDays, sub: "The whole month: every week, day and exercise" },
  { path: "/feed", label: "Social", icon: Newspaper, sub: "Friends' workouts, posts, likes and comments" },
  { path: "/stats", label: "Stats", icon: BarChart3, sub: "Are you getting stronger? Trends per exercise" },
];

/** Routes that belong to the Social tab (it stays highlighted on them). */
export const SOCIAL_ROUTES = ["/feed", "/friends", "/chats", "/notifications", "/compete"];
export const isSocialRoute = (r: string) => SOCIAL_ROUTES.includes(r) || r.startsWith("/chat/") || r.startsWith("/u/");

/** Section headers for the secondary pages, in display order. */
export const GROUPS: { id: NavGroup; label: string }[] = [
  { id: "social", label: "Friends" },
  { id: "daily", label: "Track daily" },
  { id: "train", label: "Train" },
  { id: "learn", label: "Library & learn" },
  { id: "app", label: "App" },
];

/** Secondary pages ("More" on phones, lower sidebar on desktop), grouped by `group`. */
export const MORE: NavItem[] = [
  { path: "/chats", label: "Messages", icon: MessagesSquare, tone: "info", group: "social", sub: "Chat with friends · photos, voice notes, stickers" },
  { path: "/friends", label: "Friends", icon: Users, group: "social", sub: "Find friends, requests, who you follow" },
  { path: "/compete", label: "Leaderboard & challenges", icon: Trophy, tone: "warn", group: "social", sub: "Who trained most · challenges · cheer each other" },
  { path: "/notifications", label: "Activity", icon: Bell, group: "social", sub: "Requests, likes, comments, cheers" },
  { path: "/history", label: "History", icon: History, group: "train", sub: "Calendar + every workout and missed day" },
  { path: "/programs", label: "Programs", icon: ListChecks, group: "train", sub: "Pick or build a plan that fits your week" },
  { path: "/creatine", label: "Creatine", icon: FlaskConical, tone: "vio", group: "daily", sub: "Daily grams toward your target" },
  { path: "/body", label: "Body & habits", icon: PersonStanding, group: "daily", sub: "Weight, waist, sleep, protein, steps, water" },
  { path: "/journal", label: "Notes & Journal", icon: NotebookPen, group: "daily", sub: "Every note, mood and voice memo · searchable" },
  { path: "/months", label: "Months", icon: CalendarRange, tone: "info", group: "train", sub: "Each month saved: progress, PRs, versions, notes" },
  { path: "/cardio", label: "Cardio", icon: Footprints, tone: "info", group: "train", sub: "Treadmill intervals and hill walks with a timer" },
  { path: "/extra", label: "Grip & Wrist", icon: HandFist, group: "train", sub: "Optional 2×/week extra · start, skip, history" },
  { path: "/tests", label: "Tests", icon: Target, group: "train", sub: "Benchmarks: pull-ups, dips, hangs over time" },
  { path: "/library", label: "Exercise library", icon: Library, group: "learn", sub: "Every exercise · videos · alternatives" },
  { path: "/learn", label: "Learn", icon: BookOpen, tone: "info", group: "learn", sub: "Terms, warm-up, levels, what-if, nutrition" },
  { path: "/settings", label: "Settings", icon: Settings, group: "app", sub: "Schedule, targets, export, reset" },
  { path: "/privacy", label: "Privacy", icon: Shield, group: "app", sub: "What friends can see" },
  { path: "/admin", label: "Admin", icon: Gauge, group: "app", ownerOnly: true, sub: "Users, activity, usage, insights (owner only)" },
  { path: "/security", label: "Account & security", icon: LockKeyhole, group: "app", sub: "Passcode, Google sign-in, invites" },
];

export const MORE_TAB: NavItem = { path: "/more", label: "More", icon: LayoutGrid, sub: "" };
/** Last bottom-bar tab: your profile (shows your avatar). Everything in MORE is one tap away from it (≡ menu). */
export const YOU_TAB: NavItem = { path: "/profile", label: "You", icon: UserRound, sub: "" };

/** MORE split into labelled sections (empty sections dropped). */
export const moreGroups = (role?: string) => GROUPS.map((g) => ({ ...g, items: MORE.filter((m) => m.group === g.id && (!m.ownerOnly || role === "owner")) })).filter((g) => g.items.length);
