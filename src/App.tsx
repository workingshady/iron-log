import { useEffect, useState } from "react";
import { CloudOff } from "lucide-react";
import { get, isDev, onPending, setMode, Unauthorized } from "./lib/api";
import { cx } from "./lib/util";
import { MAIN, MORE, MORE_TAB } from "./nav";
import Login from "./screens/Login";
import Home from "./screens/Home";
import Plan from "./screens/Plan";
import SessionScreen from "./screens/Session";
import History from "./screens/History";
import Stats from "./screens/Stats";
import Body from "./screens/Body";
import Creatine from "./screens/Creatine";
import Tests from "./screens/Tests";
import Journal from "./screens/Journal";
import Learn from "./screens/Learn";
import Settings from "./screens/Settings";
import More from "./screens/More";
import Cardio from "./screens/Cardio";
import { ErrorBoundary } from "./components/ErrorBoundary";

function useRoute() {
  const [h, setH] = useState(location.hash.slice(1) || "/");
  useEffect(() => {
    const f = () => { setH(location.hash.slice(1) || "/"); window.scrollTo(0, 0); };
    window.addEventListener("hashchange", f);
    return () => window.removeEventListener("hashchange", f);
  }, []);
  return h;
}

const PAGES: Record<string, () => React.ReactElement | null> = {
  "/": Home, "/plan": Plan, "/history": History, "/stats": Stats, "/body": Body, "/creatine": Creatine,
  "/tests": Tests, "/journal": Journal, "/notes": Journal, "/learn": Learn, "/settings": Settings, "/more": More, "/cardio": Cardio,
};

export default function App() {
  const route = useRoute();
  const [auth, setAuth] = useState<"checking" | "in" | "out">("checking");
  const [pending, setPending] = useState(0);

  useEffect(() => {
    get<{ dev?: boolean }>("/me")
      .then((r) => { if (setMode(!!r.dev)) location.reload(); else setAuth("in"); })
      .catch((e) => setAuth(e instanceof Unauthorized ? "out" : "in"));
  }, []);
  // show the "waiting to sync" badge only if writes stay stuck (offline / >6 s), not for normal in-flight saves
  const [raw, setRaw] = useState(0);
  useEffect(() => onPending(setRaw), []);
  useEffect(() => {
    if (!raw) { setPending(0); return; }
    if (!navigator.onLine) { setPending(raw); return; }
    const t = setTimeout(() => setPending(raw), 6000);
    return () => clearTimeout(t);
  }, [raw]);

  if (auth === "checking") return null;
  if (auth === "out") return <Login onIn={() => setAuth("in")} />;

  const inSession = route.startsWith("/s/");
  const Page = PAGES[route] ?? Home;
  const isMore = MORE.some((m) => m.path === route) || route === "/more";

  return (
    <div className="min-h-dvh md:pl-60">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-line bg-bg px-3 py-5 md:flex">
        <a href="#/" className="mb-6 flex items-center gap-2 px-2 text-lg font-bold">
          <img src="/icon.svg" alt="" className="h-8 w-8" /> Iron Log
        </a>
        <NavList items={MAIN} route={route} />
        <div className="mx-2 my-4 h-px bg-line" />
        <NavList items={MORE} route={route} />
      </aside>

      {isDev() && (
        <div className="sticky top-0 z-40 flex items-center justify-center gap-2 bg-warn px-3 py-1 text-xs font-bold text-black md:pl-60">
          DEV MODE · test database with dummy data · your real tracking is untouched
        </div>
      )}
      {pending > 0 && (
        <div className="fixed right-3 top-[max(0.75rem,env(safe-area-inset-top))] z-40 inline-flex items-center gap-1.5 rounded-full bg-warn px-2.5 py-1 text-xs font-semibold text-black">
          <CloudOff size={13} /> {pending} waiting to sync
        </div>
      )}

      <main className={cx("mx-auto px-4 pt-[calc(1.25rem+env(safe-area-inset-top))] md:px-8 md:pt-8", inSession ? "max-w-2xl pb-40" : "max-w-5xl pb-[calc(7rem+env(safe-area-inset-bottom))] md:pb-12")}>
        <ErrorBoundary resetKey={route}>{inSession ? <SessionScreen key={route} id={route.slice(3)} /> : <Page />}</ErrorBoundary>
      </main>

      {/* Phone bottom bar */}
      {!inSession && (
        <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/95 backdrop-blur safe-b md:hidden">
          <div className="mx-auto flex max-w-lg">
            {[...MAIN, MORE_TAB].map((t) => {
              const on = t === MORE_TAB ? isMore : route === t.path;
              return (
                <a key={t.path} href={`#${t.path}`} className={cx("flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px]", on ? "text-acc" : "text-mute")}>
                  <t.icon size={22} strokeWidth={on ? 2.4 : 1.8} />
                  {t.label}
                </a>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}

function NavList({ items, route }: { items: typeof MAIN; route: string }) {
  return (
    <nav className="flex flex-col gap-0.5">
      {items.map((t) => (
        <a
          key={t.path}
          href={`#${t.path}`}
          className={cx("flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm", route === t.path ? "bg-card2 font-semibold text-ink" : "text-mute hover:bg-card hover:text-ink")}
        >
          <t.icon size={18} className={route === t.path ? "text-acc" : ""} />
          {t.label}
        </a>
      ))}
    </nav>
  );
}
