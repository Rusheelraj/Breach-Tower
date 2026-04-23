import { useState, useEffect } from "react";
import { api } from "../api";
import { fmtDateTime as fmtDate } from "../utils/dates";
import { useAuth } from "../auth/AuthContext";

function DeviceIcon({ ua }) {
  const isMobile = /mobile|android|iphone/i.test(ua || "");
  return isMobile ? (
    <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
    </svg>
  ) : (
    <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  );
}

function parseBrowser(ua) {
  if (!ua) return "Unknown browser";
  if (/edg/i.test(ua)) return "Microsoft Edge";
  if (/chrome/i.test(ua)) return "Chrome";
  if (/firefox/i.test(ua)) return "Firefox";
  if (/safari/i.test(ua)) return "Safari";
  return ua.slice(0, 40);
}

function getCurrentJti() {
  try {
    const token = localStorage.getItem("ds_token") || "";
    if (!token) return null;
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.jti || null;
  } catch { return null; }
}

export default function Sessions() {
  const { logout } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState(null);
  const [revokingAll, setRevokingAll] = useState(false);
  const [toast, setToast] = useState(null);
  const currentJti = getCurrentJti();

  function showToast(msg, type = "ok") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }

  async function load() {
    setLoading(true);
    try { setSessions(await api.getSessions()); }
    catch { showToast("Failed to load sessions.", "err"); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function handleRevoke(id) {
    setRevoking(id);
    try {
      const target = sessions.find((s) => s.id === id);
      await api.revokeSession(id);
      setSessions((s) => s.filter((x) => x.id !== id));
      // If the revoked session was the current one, sign out immediately
      if (target?.token_jti === currentJti) {
        showToast("Your current session was revoked. Signing out…");
        setTimeout(() => logout(), 1500);
      } else {
        showToast("Session revoked.");
      }
    } catch { showToast("Failed to revoke session.", "err"); }
    finally { setRevoking(null); }
  }

  async function handleRevokeAll() {
    setRevokingAll(true);
    try {
      await api.revokeAllSessions();
      setSessions([]);
      showToast("All sessions revoked. Signing out…");
      setTimeout(() => logout(), 1500);
    } catch { showToast("Failed to revoke sessions.", "err"); }
    finally { setRevokingAll(false); }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold text-white tracking-wide">Active Sessions</h1>
          <p className="text-xs text-gray-600 mt-0.5">View and revoke your active login sessions across all devices</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-500 rounded-lg transition-all shadow-sm"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
          <button
            onClick={handleRevokeAll}
            disabled={revokingAll || sessions.length === 0}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-500 rounded-lg transition-all shadow-sm disabled:opacity-40"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            {revokingAll ? "Revoking…" : "Sign Out All Devices"}
          </button>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded border text-sm font-semibold shadow-2xl
          ${toast.type === "err" ? "bg-red-600/20 border-red-600/40 text-red-400" : "bg-green-600/20 border-green-600/40 text-green-400"}`}>
          {toast.msg}
        </div>
      )}

      {/* Sessions list */}
      <div className="bg-[#111113] border border-[#1c1c1f] rounded overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-gray-600 text-sm">Loading sessions…</div>
        ) : sessions.length === 0 ? (
          <div className="py-16 text-center space-y-3">
            <svg className="w-10 h-10 text-gray-700 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <p className="text-sm text-gray-600">No active sessions</p>
          </div>
        ) : (
          <div>
            {sessions.map((s, i) => {
              const isCurrent = s.token_jti === currentJti;
              return (
                <div key={s.id} className={`flex items-center justify-between gap-4 px-5 py-4
                  ${isCurrent ? "bg-red-500/5 border-l-2 border-l-red-500" : ""}
                  ${i < sessions.length - 1 ? "border-b border-[#1c1c1f]" : ""}`}>
                  <div className="flex items-center gap-4">
                    <div className={`w-9 h-9 rounded border flex items-center justify-center shrink-0
                      ${isCurrent ? "bg-red-500/10 border-red-500/30" : "bg-[#09090b] border-[#1c1c1f]"}`}>
                      <DeviceIcon ua={s.user_agent} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-gray-300">{parseBrowser(s.user_agent)}</p>
                        {isCurrent && (
                          <span className="flex items-center gap-1 text-[10px] font-semibold text-red-400 bg-red-500/10 border border-red-500/25 px-1.5 py-0.5 rounded-md">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse"/>
                            This device
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        {s.ip_address && (
                          <span className="text-[11px] text-gray-600 font-mono">{s.ip_address}</span>
                        )}
                        <span className="text-[11px] text-gray-700">·</span>
                        <span className="text-[11px] text-gray-600">Last seen {fmtDate(s.last_seen)}</span>
                      </div>
                      <p className="text-[10px] text-gray-700 mt-0.5">Created {fmtDate(s.created_at)}</p>
                    </div>
                  </div>
                  {isCurrent ? (
                    <span className="px-3 py-1.5 text-xs font-semibold text-red-500/60 border border-red-500/15 rounded-lg shrink-0">
                      Current
                    </span>
                  ) : (
                    <button
                      onClick={() => handleRevoke(s.id)}
                      disabled={revoking === s.id}
                      className="px-4 py-1.5 text-sm font-semibold text-white bg-red-600 hover:bg-red-500 rounded-lg transition-all shadow-sm disabled:opacity-40 shrink-0"
                    >
                      {revoking === s.id ? "…" : "Revoke"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <p className="text-[11px] text-red-500/70 font-mono">
        Revoking a session immediately invalidates that device's access token. The user will be signed out on their next request.
      </p>
    </div>
  );
}
