import {
  BarChart3, BookOpen, CalendarDays, FlaskConical, Footprints, HandFist, History, House, LayoutGrid, Library, NotebookPen, PersonStanding, Settings, Target,
  type LucideIcon,
} from "lucide-react";

export const go = (path: string) => (location.hash = path);

export type NavGroup = "daily" | "train" | "learn" | "app";

export interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
  sub: string; // one short line: what this page is for
  group?: NavGroup;
  /** Icon colour, only when the page owns a meaning colour (vio = creatine, info = cardio/learn). */
  tone?: "info" | "vio" | "warn";
}

/** Main pages (bottom bar on phones, top of the sidebar on desktop). 3-5 destinations (Material 3 / Hick's law). */
export const MAIN: NavItem[] = [
  { path: "/", label: "Home", icon: House, sub: "Next workout, streak and this week at a glance" },
  { path: "/plan", label: "Plan", icon: CalendarDays, sub: "The whole month: every week, day and exercise" },
  { path: "/history", label: "History", icon: History, sub: "Calendar + every workout and missed day" },
  { path: "/stats", label: "Stats", icon: BarChart3, sub: "Are you getting stronger? Trends per exercise" },
];

/** Section headers for the secondary pages, in display order. */
export const GROUPS: { id: NavGroup; label: string }[] = [
  { id: "daily", label: "Track daily" },
  { id: "train", label: "Train" },
  { id: "learn", label: "Library & learn" },
  { id: "app", label: "App" },
];

/** Secondary pages ("More" on phones, lower sidebar on desktop), grouped by `group`. */
export const MORE: NavItem[] = [
  { path: "/creatine", label: "Creatine", icon: FlaskConical, tone: "vio", group: "daily", sub: "Daily grams toward your target" },
  { path: "/body", label: "Body & habits", icon: PersonStanding, group: "daily", sub: "Weight, waist, sleep, protein, steps, water" },
  { path: "/journal", label: "Notes & Journal", icon: NotebookPen, group: "daily", sub: "Every note, mood and voice memo · searchable" },
  { path: "/cardio", label: "Cardio", icon: Footprints, tone: "info", group: "train", sub: "Treadmill intervals and hill walks with a timer" },
  { path: "/extra", label: "Grip & Wrist", icon: HandFist, group: "train", sub: "Optional 2×/week extra · start, skip, history" },
  { path: "/tests", label: "Tests", icon: Target, group: "train", sub: "Benchmarks: pull-ups, dips, hangs over time" },
  { path: "/library", label: "Exercise library", icon: Library, group: "learn", sub: "Every exercise · videos · alternatives" },
  { path: "/learn", label: "Learn", icon: BookOpen, tone: "info", group: "learn", sub: "Terms, warm-up, levels, what-if, nutrition" },
  { path: "/settings", label: "Settings", icon: Settings, group: "app", sub: "Schedule, targets, export, reset" },
];

export const MORE_TAB: NavItem = { path: "/more", label: "More", icon: LayoutGrid, sub: "" };

/** MORE split into labelled sections (empty sections dropped). */
export const moreGroups = () => GROUPS.map((g) => ({ ...g, items: MORE.filter((m) => m.group === g.id) })).filter((g) => g.items.length);
