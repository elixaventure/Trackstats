import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { APP_NAME } from "@/config/env";
import { useDb } from "@/hooks/useDb";
import { useOnline } from "@/hooks/useOnline";
import { useSync } from "@/hooks/useSync";
import { useRide } from "@/session/useRide";
import { Icon, type IconName } from "./Icon";

const NAV: { to: string; label: string; icon: IconName; end?: boolean }[] = [
  { to: "/", label: "Home", icon: "home", end: true },
  { to: "/ride", label: "Ride", icon: "ride" },
  { to: "/progress", label: "Progress", icon: "progress" },
  { to: "/routes", label: "Routes", icon: "routes" },
  { to: "/profile", label: "Profile", icon: "profile" },
];

const MORE: { to: string; label: string; icon: IconName }[] = [
  { to: "/sessions", label: "Sessions", icon: "clock" },
  { to: "/leaderboards", label: "Leaderboards", icon: "trophy" },
  { to: "/achievements", label: "Achievements", icon: "award" },
  { to: "/transponders", label: "Transponders", icon: "tag" },
  { to: "/groups", label: "Groups", icon: "users" },
  { to: "/settings", label: "Settings & sync", icon: "settings" },
];

function StatusStrip() {
  const online = useOnline();
  const sync = useSync();
  const db = useDb();
  const ride = useRide();
  const { pathname } = useLocation();
  const showRide = ride.ride && !pathname.startsWith("/ride/live");
  if (!showRide && online && !db.settings.demoMode && sync.pending === 0) return null;
  return (
    <div className="sticky top-0 z-30 safe-top bg-bg/95 backdrop-blur">
      {showRide && (
        <Link to="/ride/live" className="flex min-h-12 items-center justify-center gap-2 bg-plate px-4 font-display text-lg font-extrabold uppercase tracking-wide text-plate-ink">
          <span className="size-2.5 animate-pulse rounded-full bg-slower" /> Ride in progress — tap to return
        </Link>
      )}
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 px-4 py-1.5 font-mono text-xs text-muted">
        {db.settings.demoMode && <span>Demo data on this device · not synced</span>}
        {!online && <span className="flex items-center gap-1 text-warn"><Icon name="offline" className="size-4" /> Offline — recording locally</span>}
        {!db.settings.demoMode && sync.pending > 0 && <span>{sync.pending} change{sync.pending === 1 ? "" : "s"} waiting to sync</span>}
      </div>
    </div>
  );
}

export function AppShell() {
  return (
    <div className="min-h-dvh md:pl-64">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col border-r border-line bg-surface p-4 md:flex">
        <Link to="/" className="mb-6 flex items-center gap-2 px-2">
          <img src="/favicon.svg" alt="" className="size-9" />
          <span className="font-display text-3xl font-black uppercase tracking-wide">{APP_NAME}</span>
        </Link>
        <nav aria-label="Main" className="flex flex-col gap-1">
          {NAV.map((n) => <SideLink key={n.to} {...n} />)}
        </nav>
        <div className="my-4 border-t border-line" />
        <nav aria-label="More" className="flex flex-col gap-1">
          {MORE.map((n) => <SideLink key={n.to} {...n} />)}
        </nav>
      </aside>

      <StatusStrip />
      <main className="mx-auto max-w-5xl px-4 pb-32 pt-5 md:px-8 md:pb-12">
        <Outlet />
      </main>

      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 backdrop-blur safe-bottom md:hidden">
        <div className="grid grid-cols-5">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} aria-label={n.label}
              className={({ isActive }) => `flex min-h-16 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold uppercase tracking-wide ${isActive ? "text-plate" : "text-muted"}`}>
              {n.to === "/ride"
                ? <span className="grid size-11 place-items-center rounded-full bg-plate text-plate-ink"><Icon name="ride" className="size-7" /></span>
                : <Icon name={n.icon} className="size-6" />}
              {n.to !== "/ride" && n.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}

function SideLink({ to, label, icon, end }: { to: string; label: string; icon: IconName; end?: boolean }) {
  return (
    <NavLink to={to} end={end}
      className={({ isActive }) => `flex min-h-12 items-center gap-3 rounded-xl px-3 font-semibold ${isActive ? "bg-plate/10 text-plate" : "text-ink hover:bg-surface-2"}`}>
      <Icon name={icon} className="size-5" /> {label}
    </NavLink>
  );
}

export { MORE as SECONDARY_NAV };
