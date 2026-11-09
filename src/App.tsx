import { useEffect, useState } from "react";
import { get, onPending, Unauthorized } from "./lib/api";
import { cx } from "./lib/util";
import Login from "./screens/Login";
import Today from "./screens/Today";
import SessionScreen from "./screens/Session";
import History from "./screens/History";
import Progress from "./screens/Progress";
import Me from "./screens/Me";

// Hash routes: #/ · #/s/<id> · #/history · #/progress · #/me
function useRoute() {
  const [h, setH] = useState(location.hash.slice(1) || "/");
  useEffect(() => {
    const f = () => setH(location.hash.slice(1) || "/");
    window.addEventListener("hashchange", f);
    return () => window.removeEventListener("hashchange", f);
  }, []);
  return h;
}
export const go = (path: string) => (location.hash = path);

const TABS = [
  { path: "/", label: "Today", icon: "M3 12l9-8 9 8M5 10v10h14V10" },
  { path: "/history", label: "History", icon: "M12 8v4l3 2M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
  { path: "/progress", label: "Progress", icon: "M4 19V9M10 19V5M16 19v-7M22 19H2" },
  { path: "/me", label: "Me", icon: "M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0" },
];

export default function App() {
  const route = useRoute();
  const [auth, setAuth] = useState<"checking" | "in" | "out">("checking");
  const [pending, setPending] = useState(0);

  useEffect(() => {
    get("/me").then(() => setAuth("in")).catch((e) => setAuth(e instanceof Unauthorized ? "out" : "in"));
  }, []);
  useEffect(() => onPending(setPending), []);

  if (auth === "checking") return null;
  if (auth === "out") return <Login onIn={() => setAuth("in")} />;

  const inSession = route.startsWith("/s/");
  return (
    <div className="mx-auto min-h-dvh max-w-lg">
      {pending > 0 && (
        <div className="fixed right-3 top-3 z-40 rounded-full bg-warn px-2.5 py-1 text-xs font-semibold text-black">
          {pending} unsynced
        </div>
      )}
      <main className={cx("px-4 pt-4", inSession ? "pb-40" : "pb-28")}>
        {inSession ? (
          <SessionScreen key={route} id={route.slice(3)} />
        ) : route === "/history" ? (
          <History />
        ) : route === "/progress" ? (
          <Progress />
        ) : route === "/me" ? (
          <Me />
        ) : (
          <Today />
        )}
      </main>
      {!inSession && (
        <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/95 backdrop-blur safe-b">
          <div className="mx-auto flex max-w-lg">
            {TABS.map((t) => (
              <a key={t.path} href={`#${t.path}`} className={cx("flex flex-1 flex-col items-center gap-1 py-2.5 text-xs", route === t.path ? "text-acc" : "text-mute")}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d={t.icon} />
                </svg>
                {t.label}
              </a>
            ))}
          </div>
        </nav>
      )}
    </div>
  );
}
