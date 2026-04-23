import { useState } from "react";
import { useAuth } from "./auth/AuthContext";
import AuthPage from "./pages/AuthPage";
import Dashboard from "./pages/Dashboard";
import Targets from "./pages/Targets";
import Settings from "./pages/Settings";
import Users from "./pages/Users";
import AuditLog from "./pages/AuditLog";
import Sessions from "./pages/Sessions";
import Security from "./pages/Security";
import Reports from "./pages/Reports";

const NAV = [
  { id: "dashboard", label: "Dashboard", adminOnly: false, icon: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  )},
  { id: "targets", label: "Targets", adminOnly: false, icon: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  )},
  { id: "users", label: "Users", adminOnly: true, icon: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  )},
  { id: "auditlog", label: "Audit Log", adminOnly: true, icon: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
    </svg>
  )},
  { id: "sessions", label: "Sessions", adminOnly: false, icon: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  )},
  { id: "security", label: "Security", adminOnly: false, icon: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  )},
  { id: "reports", label: "Reports", adminOnly: false, icon: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  )},
  { id: "settings", label: "Settings", adminOnly: true, icon: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )},
];

const PAGE_MAP = {
  dashboard: Dashboard,
  targets:   Targets,
  users:     Users,
  auditlog:  AuditLog,
  sessions:  Sessions,
  security:  Security,
  reports:   Reports,
  settings:  Settings,
};

export default function App() {
  const { isAuthenticated, user, logout } = useAuth();
  const [page, setPage] = useState("dashboard");
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  if (!isAuthenticated) return <AuthPage />;

  const isAdmin = user?.role === "admin";
  const visibleNav = NAV.filter((n) => !n.adminOnly || isAdmin);
  const Page = PAGE_MAP[page] ?? Dashboard;

  const initials = user?.name
    ? user.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()
    : "??";

  return (
    <div className="min-h-screen bg-[#09090b] flex text-[#e4e4e7]" style={{ fontFamily: '"DM Sans", system-ui, sans-serif' }}>

      {/* ── Sidebar ── */}
      <aside className="w-56 bg-[#111113] border-r border-[#1c1c1f] flex flex-col shrink-0 h-screen sticky top-0">

        {/* Logo */}
        <div className="px-4 py-5 border-b border-[#1c1c1f]">
          <div className="flex items-center gap-2.5">
            <img src="/logo-128.png" alt="Breach Tower" className="w-7 h-7 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-white tracking-tight">Breach Tower</p>
              <p className="text-[10px] text-zinc-500 tracking-wide">Threat Intelligence</p>
            </div>
          </div>
        </div>

        {/* Nav — scrolls independently */}
        <nav className="flex-1 px-3 py-3 flex flex-col gap-0.5 overflow-y-auto min-h-0">
          {visibleNav.map((item) => (
            <button
              key={item.id}
              onClick={() => setPage(item.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-base font-medium transition-all
                ${page === item.id
                  ? "bg-red-500/10 text-red-400"
                  : "text-zinc-500 hover:text-zinc-200 hover:bg-white/5"}`}
            >
              <span className={page === item.id ? "text-red-400" : "text-zinc-600"}>{item.icon}</span>
              {item.label}
              {page === item.id && (
                <span className="ml-auto w-1 h-1 rounded-full bg-red-500"></span>
              )}
            </button>
          ))}
        </nav>

        {/* ── User card — pinned to bottom ── */}
        <div className="border-t border-[#1c1c1f] p-3 shrink-0 relative">
          {userMenuOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setUserMenuOpen(false)} />
              <div className="absolute left-3 bottom-full mb-2 z-40 bg-[#111113] border border-[#1c1c1f] rounded-xl shadow-2xl w-48 overflow-hidden">
                <div className="px-3 py-2.5 border-b border-[#1c1c1f]">
                  <p className="text-sm font-semibold text-white truncate">{user?.name}</p>
                  <p className="text-xs text-zinc-500 font-mono truncate mt-0.5">{user?.email}</p>
                  {isAdmin && (
                    <span className="inline-flex mt-1.5 px-1.5 py-0.5 rounded-md bg-red-500/10 text-red-400 text-xs font-medium">Admin</span>
                  )}
                </div>
                <div className="px-3 py-2">
                  <button
                    onClick={() => { setUserMenuOpen(false); logout(); }}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-500 rounded-lg transition-all shadow-sm"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                    Sign out
                  </button>
                </div>
              </div>
            </>
          )}
          <button
            onClick={() => setUserMenuOpen((o) => !o)}
            className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-white/5 transition-colors"
          >
            <div className="w-7 h-7 rounded-full bg-red-500/15 border border-red-500/20 flex items-center justify-center shrink-0">
              <span className="text-xs font-bold text-red-400">{initials}</span>
            </div>
            <div className="text-left min-w-0 flex-1">
              <p className="text-xs font-semibold text-zinc-300 truncate leading-none">{user?.name}</p>
              <p className="text-[11px] text-zinc-600 truncate mt-0.5">{isAdmin ? "Admin" : "Analyst"}</p>
            </div>
            <svg className="w-3 h-3 text-zinc-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
          </button>
        </div>
      </aside>

      {/* ── Main ── */}
      <div className="flex-1 flex flex-col min-h-screen overflow-y-auto">

        {/* Top bar */}
        <header className="h-12 bg-[#111113] border-b border-[#1c1c1f] flex items-center px-5 shrink-0">
          <div className="flex items-center gap-1.5 text-xs text-zinc-600">
            <span>Breach Tower</span>
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <span className="text-zinc-400 font-medium">{NAV.find((n) => n.id === page)?.label}</span>
          </div>
          <div className="ml-auto flex items-center gap-1.5 text-[11px] text-zinc-600">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            <span>Monitoring</span>
          </div>
        </header>

        {/* Page */}
        <main className="flex-1 p-6 overflow-auto">
          <Page />
        </main>
      </div>
    </div>
  );
}
