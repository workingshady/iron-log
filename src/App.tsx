import { useEffect, useState } from "react";
import { CloudOff } from "lucide-react";
import { get, isDev, onPending, setMode, Unauthorized } from "./lib/api";
import { cx } from "./lib/util";
import { MAIN, MORE, MORE_TAB, YOU_TAB, isSocialRoute, moreGroups, type NavItem } from "./nav";
import { useBadges } from "./lib/badges";
import { syncPush } from "./lib/push";
import Login, { Setup } from "./screens/Login";
import Splash from "./screens/Splash";
import Home from "./screens/Home";
import Plan from "./screens/Plan";
import SessionScreen from "./screens/Session";
import History from "./screens/History";
import Stats from "./screens/Stats";
import Body from "./screens/Body";
import Creatine from "./screens/Creatine";
import Tests from "./screens/Tests";
import Journal from "./screens/Journal";
import Extras from "./screens/Extras";
import Library from "./screens/Library";
import Months from "./screens/Months";
import Learn from "./screens/Learn";
import Settings from "./screens/Settings";
import More from "./screens/More";
import Cardio from "./screens/Cardio";
import Profile from "./screens/Profile";
import Feed from "./screens/Feed";
import Friends from "./screens/Friends";
import UserProfile from "./screens/UserProfile";
import Privacy from "./screens/Privacy";
import Notifications from "./screens/Notifications";
import Chats from "./screens/Chats";
import ChatRoomScreen from "./screens/ChatRoom";
import Programs from "./screens/Programs";
import ProgramEditor from "./screens/ProgramEditor";
import Security from "./screens/Security";
import Compete from "./screens/Compete";
import Admin from "./screens/Admin";
import { Avatar } from "./components/Avatar";
import { setMe, useMe, type Me } from "./lib/me";
import { ErrorBoundary } from "./components/ErrorBoundary";

/** Page titles for the browser tab / screen readers. */
const TITLE: Record<string, string> = { "/": "Home", "/profile": "Profile", "/notes": "Notes & Journal", ...Object.fromEntries([...MAIN, ...MORE, MORE_TAB].map((n) => [n.path, n.label])) };

/**
 * Hash routes. Going BACK to a page restores where you were scrolled (like Instagram); going forward starts at the top.
 * After every change focus moves to <main> so screen readers announce the new page, and the tab title updates.
 */
function useRoute() {
  const [h, setH] = useState(location.hash.slice(1) || "/");
  useEffect(() => {
    const stack: string[] = [location.hash.slice(1) || "/"];
    const pos = new Map<string, number>();
    let cur = stack[0];
    const f = () => {
      const next = location.hash.slice(1) || "/";
      pos.set(cur, window.scrollY);
      const back = stack.length > 1 && stack[stack.length - 2] === next;
      if (back) stack.pop(); else stack.push(next);
      if (stack.length > 50) stack.shift();
      cur = next;
      setH(next);
      requestAnimationFrame(() => {
        window.scrollTo(0, back ? pos.get(next) ?? 0 : 0);
        document.getElementById("main")?.focus({ preventScroll: true });
      });
    };
    window.addEventListener("hashchange", f);
    return () => window.removeEventListener("hashchange", f);
  }, []);
  return h;
}

const PAGES: Record<string, () => React.ReactElement | null> = {
  "/": Home, "/plan": Plan, "/history": History, "/stats": Stats, "/body": Body, "/creatine": Creatine,
  "/tests": Tests, "/journal": Journal, "/notes": Journal, "/extra": Extras, "/library": Library, "/months": Months, "/learn": Learn, "/settings": Settings, "/more": More, "/cardio": Cardio, "/profile": Profile,
  "/feed": Feed, "/friends": Friends, "/privacy": Privacy, "/notifications": Notifications, "/chats": Chats, "/programs": Programs, "/security": Security, "/compete": Compete, "/admin": Admin,
};

export default function App() {
  const route = useRoute();
  const [auth, setAuth] = useState<"checking" | "in" | "out" | "setup">("checking");
  const [pending, setPending] = useState(0);
  const me = useMe();
  const badges = useBadges(auth === "in");
  // re-register this phone for notifications if the server pruned it or the key changed (never prompts)
  useEffect(() => { if (auth === "in" && me?.id) void syncPush(); }, [auth, me?.id]);

  useEffect(() => {
    get<{ dev?: boolean; user?: Me | null; setup?: boolean }>("/me")
      .then((r) => { setMe(r.user ?? null); if (setMode(!!r.dev)) location.reload(); else setAuth(r.setup ? "setup" : "in"); })
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

  useEffect(() => { document.title = `${route.startsWith("/s/") ? "Workout" : TITLE[route] ?? "Iron Log"} · Iron Log`; }, [route]);

  if (auth === "checking") return <Splash />;
  if (auth === "out") return <Login onIn={() => setAuth("in")} />;
  if (auth === "setup") return <Setup />;

  const inSession = route.startsWith("/s/");
  // pages with a parameter: #/u/<username> · #/chat/<id> · #/program/<id>
  if (route.startsWith("/join/")) { location.replace("#/security"); return null; } // already logged in → invites live in Security
  const param = (p: string) => (route.startsWith(p) ? decodeURIComponent(route.slice(p.length)) : null);
  const Page = PAGES[route] ?? Home;
  const pageEl = param("/u/") != null ? <UserProfile key={route} username={param("/u/")!} />
    : param("/chat/") != null ? <ChatRoomScreen key={route} id={param("/chat/")!} />
    : param("/program/") != null ? <ProgramEditor key={route} id={param("/program/")!} />
    : <Page />;
  const isYou = (MORE.some((m) => m.path === route) && !isSocialRoute(route)) || ["/more", "/notes", "/profile", "/security", "/privacy", "/programs"].includes(route) || route.startsWith("/program/");

  return (
    <div className="min-h-dvh md:pl-60">
      {/* Keyboard: jump past the navigation (a button, because #hashes are routes here) */}
      <button
        type="button"
        onClick={() => document.getElementById("main")?.focus()}
        className="sr-only-focusable fixed left-3 top-3 z-50 rounded-xl bg-acc px-4 py-3 text-sm font-semibold text-acc-ink"
      >
        Skip to content
      </button>

      {/* Desktop sidebar: same model as the phone (main pages, then the grouped "More" pages) */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col overflow-y-auto border-r border-line bg-bg px-3 py-5 md:flex">
        <a href="#/" className="mb-5 flex min-h-11 items-center gap-2 px-2 text-lg font-bold">
          <img src="/icon.svg" alt="" className="h-8 w-8" /> Iron Log
        </a>
        <ProfileChip on={route === "/profile"} />
        <nav aria-label="Main">
          <NavList items={MAIN} route={route} />
          {moreGroups(me?.role).map((g) => (
            <div key={g.id} className="mt-4">
              <h2 className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wide text-faint">{g.label}</h2>
              <NavList items={g.items} route={route} />
            </div>
          ))}
        </nav>
      </aside>

      {isDev() && (
        <div className="sticky top-0 z-40 flex items-center justify-center gap-2 bg-warn px-3 py-1 text-xs font-bold text-black md:pl-60">
          DEV MODE · test database with dummy data · your real tracking is untouched
        </div>
      )}
      {pending > 0 && (
        <div role="status" className="fixed right-3 top-[max(0.75rem,env(safe-area-inset-top))] z-40 inline-flex items-center gap-1.5 rounded-full bg-warn px-2.5 py-1 text-xs font-semibold text-black">
          <CloudOff size={13} aria-hidden /> {pending} waiting to sync
        </div>
      )}

      <main id="main" tabIndex={-1} className={cx("mx-auto px-4 pt-[calc(1.25rem+env(safe-area-inset-top))] outline-none md:px-8 md:pt-8", inSession ? "max-w-2xl pb-40" : "max-w-5xl pb-[calc(7rem+env(safe-area-inset-bottom))] md:pb-12")}>
        <ErrorBoundary resetKey={route}>{inSession ? <SessionScreen key={route} id={route.slice(3)} /> : pageEl}</ErrorBoundary>
      </main>

      {/* Phone bottom bar: Material 3 navigation bar. 64 px tall, labels always shown, the active
          destination gets a pill indicator + filled-weight icon + bold label (never colour alone). */}
      {!inSession && (
        <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/95 backdrop-blur safe-b md:hidden">
          <ul className="mx-auto flex max-w-lg">
            {[...MAIN, YOU_TAB].map((t) => {
              const on = t === YOU_TAB ? isYou : t.path === "/feed" ? isSocialRoute(route) : route === t.path;
              const badge = t.path === "/feed" ? badges.total : 0;
              return (
                <li key={t.path} className="flex-1">
                  <a
                    href={`#${t.path}`}
                    aria-current={on ? "page" : undefined}
                    className={cx("group flex h-16 flex-col items-center justify-center gap-1 text-xs", on ? "font-semibold text-ink" : "text-mute active:text-ink")}
                  >
                    <span className={cx("relative flex h-8 w-14 items-center justify-center rounded-full transition-colors", on ? "bg-acc/20 text-acc" : "group-active:bg-card2")}>
                      {t === YOU_TAB ? (
                        <Avatar id={me?.avatarId} name={me?.name ?? me?.username} size={26} className={on ? "ring-2 ring-acc" : ""} />
                      ) : (
                        <t.icon size={22} strokeWidth={on ? 2.4 : 1.8} aria-hidden />
                      )}
                      {badge > 0 && (
                        <span className="absolute -top-0.5 right-2 min-w-[18px] rounded-full bg-bad px-1 text-center text-[10px] font-bold leading-[18px] text-white num" aria-hidden>{badge > 9 ? "9+" : badge}</span>
                      )}
                    </span>
                    {t.label}
                    {badge > 0 && <span className="sr-only">, {badge} new</span>}
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>
      )}
    </div>
  );
}

/** Desktop sidebar: avatar + name → Profile. */
function ProfileChip({ on }: { on: boolean }) {
  const me = useMe();
  return (
    <a href="#/profile" aria-current={on ? "page" : undefined} className={cx("mb-4 flex min-h-12 items-center gap-3 rounded-2xl px-2 py-1.5", on ? "bg-acc/20" : "hover:bg-card")}>
      <Avatar id={me?.avatarId} name={me?.name ?? me?.username} size={36} />
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold">{me?.name || me?.username || "Profile"}</span>
        {me && <span className="block truncate text-xs text-mute">@{me.username}</span>}
      </span>
    </a>
  );
}

function NavList({ items, route }: { items: NavItem[]; route: string }) {
  return (
    <ul className="flex flex-col gap-0.5">
      {items.map((t) => {
        const on = route === t.path;
        return (
          <li key={t.path}>
            <a
              href={`#${t.path}`}
              aria-current={on ? "page" : undefined}
              className={cx("flex min-h-11 items-center gap-3 rounded-full px-3 text-sm", on ? "bg-acc/20 font-semibold text-ink" : "text-mute hover:bg-card hover:text-ink")}
            >
              <t.icon size={18} strokeWidth={on ? 2.4 : 2} className={on ? "text-acc" : ""} aria-hidden />
              {t.label}
            </a>
          </li>
        );
      })}
    </ul>
  );
}
