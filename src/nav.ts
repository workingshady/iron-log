import {
  BarChart3, BookOpen, Footprints, CalendarDays, FlaskConical, History, House, LayoutGrid, NotebookPen, Ruler, Settings, Trophy, type LucideIcon,
} from "lucide-react";

export const go = (path: string) => (location.hash = path);

export interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
  sub: string; // one plain sentence: what this page is for
}

/** Main pages (bottom bar on phones, top of the sidebar on desktop). Max 5 (Hick's law). */
export const MAIN: NavItem[] = [
  { path: "/", label: "Home", icon: House, sub: "Next workout, streak and this week at a glance" },
  { path: "/plan", label: "Plan", icon: CalendarDays, sub: "The whole month: every week, day and exercise" },
  { path: "/history", label: "History", icon: History, sub: "Calendar + every workout and missed day" },
  { path: "/stats", label: "Stats", icon: BarChart3, sub: "Are you getting stronger? Trends per exercise" },
];

/** Secondary pages ("More" on phones, lower sidebar on desktop). */
export const MORE: NavItem[] = [
  { path: "/cardio", label: "Cardio", icon: Footprints, sub: "Treadmill intervals & hill walks — timer + tracker" },
  { path: "/creatine", label: "Creatine", icon: FlaskConical, sub: "Grams per day — aim for your daily target" },
  { path: "/body", label: "Body & habits", icon: Ruler, sub: "Weight, waist, sleep, protein, steps, water" },
  { path: "/tests", label: "Tests", icon: Trophy, sub: "Benchmarks: pull-ups, dips, hangs… compare over time" },
  { path: "/journal", label: "Journal", icon: NotebookPen, sub: "Free notes — how training and life are going" },
  { path: "/learn", label: "Learn", icon: BookOpen, sub: "What terms mean, warm-up, levels, what-if, nutrition" },
  { path: "/settings", label: "Settings", icon: Settings, sub: "Schedule, targets, export, reset" },
];

export const MORE_TAB: NavItem = { path: "/more", label: "More", icon: LayoutGrid, sub: "" };
