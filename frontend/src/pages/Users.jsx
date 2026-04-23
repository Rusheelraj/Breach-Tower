import { useState, useEffect } from "react";
import { api } from "../api";
import { useAuth } from "../auth/AuthContext";
import { fmtDateTime } from "../utils/dates";

function fmtDate(iso) {
  if (!iso) return "Never";
  return fmtDateTime(iso);
}

function RoleBadge({ role }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider
      ${role === "admin"
        ? "bg-red-600/20 text-red-400 border border-red-600/30"
        : "bg-blue-600/20 text-blue-400 border border-blue-600/30"}`}>
      {role}
    </span>
  );
}

function StatusBadge({ active }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider
      ${active
        ? "bg-green-600/10 text-green-400 border border-green-600/20"
        : "bg-gray-700/40 text-gray-500 border border-gray-700/40"}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${active ? "bg-green-500" : "bg-gray-600"}`}></span>
      {active ? "Active" : "Inactive"}
    </span>
  );
}

function SSOBadge({ provider }) {
  if (!provider) return null;
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-purple-600/15 text-purple-400 border border-purple-600/25">
      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
        <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
      </svg>
      {provider} sso
    </span>
  );
}

export default function Users() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(null);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    api.getUsers()
      .then(setUsers)
      .catch(() => setError("Failed to load users."))
      .finally(() => setLoading(false));
  }, []);

  function showToast(msg, type = "ok") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  async function toggleRole(u) {
    const newRole = u.role === "admin" ? "analyst" : "admin";
    setSaving(u.id + "_role");
    try {
      const updated = await api.updateUser(u.id, { role: newRole });
      setUsers((prev) => prev.map((x) => (x.id === u.id ? updated : x)));
      showToast(`${u.name} is now ${newRole}.`);
    } catch (e) {
      showToast(e.message || "Failed to update role.", "err");
    } finally {
      setSaving(null);
    }
  }

  async function toggleActive(u) {
    const newActive = !u.active;
    setSaving(u.id + "_active");
    try {
      const updated = await api.updateUser(u.id, { active: newActive });
      setUsers((prev) => prev.map((x) => (x.id === u.id ? updated : x)));
      showToast(`${u.name} ${newActive ? "reactivated" : "deactivated"}.`);
    } catch (e) {
      showToast(e.message || "Failed to update status.", "err");
    } finally {
      setSaving(null);
    }
  }

  const isSelf = (u) => u.email === currentUser?.email;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-white tracking-wide">User Management</h1>
          <p className="text-xs text-gray-600 mt-0.5">Manage accounts, roles, and access control — admin only</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-600 bg-[#111113] border border-[#1c1c1f] rounded px-3 py-2">
          <svg className="w-3.5 h-3.5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <span className="text-gray-500">{users.length} total accounts</span>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded border text-sm font-semibold shadow-2xl
          ${toast.type === "err"
            ? "bg-red-600/20 border-red-600/40 text-red-400"
            : "bg-green-600/20 border-green-600/40 text-green-400"}`}>
          {toast.msg}
        </div>
      )}

      {/* Table */}
      <div className="bg-[#111113] border border-[#1c1c1f] rounded overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-gray-600 text-sm">Loading users…</div>
        ) : error ? (
          <div className="py-16 text-center text-red-500 text-sm">{error}</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#1c1c1f]">
                <th className="text-left px-5 py-3 text-[10px] text-gray-600 uppercase tracking-widest font-semibold">User</th>
                <th className="text-left px-5 py-3 text-[10px] text-gray-600 uppercase tracking-widest font-semibold">Role</th>
                <th className="text-left px-5 py-3 text-[10px] text-gray-600 uppercase tracking-widest font-semibold hidden md:table-cell">Status</th>
                <th className="text-left px-5 py-3 text-[10px] text-gray-600 uppercase tracking-widest font-semibold hidden lg:table-cell">Last Login</th>
                <th className="text-left px-5 py-3 text-[10px] text-gray-600 uppercase tracking-widest font-semibold hidden lg:table-cell">Joined</th>
                <th className="text-right px-5 py-3 text-[10px] text-gray-600 uppercase tracking-widest font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u, i) => (
                <tr key={u.id} className={`border-b border-[#1c1c1f] last:border-0 ${isSelf(u) ? "bg-white/[0.02]" : "hover:bg-white/[0.015]"}`}>
                  {/* User info */}
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-red-600/20 border border-red-600/30 flex items-center justify-center shrink-0">
                        <span className="text-[10px] font-bold text-red-400">
                          {u.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-white">{u.name}</span>
                          {isSelf(u) && (
                            <span className="text-[10px] text-gray-600 bg-white/5 border border-white/10 rounded px-1.5 py-0.5">You</span>
                          )}
                          <SSOBadge provider={u.sso_provider} />
                        </div>
                        <p className="text-xs text-gray-600 font-mono mt-0.5">{u.email}</p>
                      </div>
                    </div>
                  </td>

                  {/* Role */}
                  <td className="px-5 py-4">
                    <RoleBadge role={u.role} />
                  </td>

                  {/* Status */}
                  <td className="px-5 py-4 hidden md:table-cell">
                    <StatusBadge active={u.active} />
                  </td>

                  {/* Last login */}
                  <td className="px-5 py-4 text-xs text-gray-500 hidden lg:table-cell">
                    {fmtDate(u.last_login)}
                  </td>

                  {/* Joined */}
                  <td className="px-5 py-4 text-xs text-gray-600 hidden lg:table-cell">
                    {fmtDate(u.created_at)}
                  </td>

                  {/* Actions */}
                  <td className="px-5 py-4">
                    <div className="flex items-center justify-end gap-2">
                      {!isSelf(u) && (
                        <>
                          <button
                            onClick={() => toggleRole(u)}
                            disabled={saving === u.id + "_role"}
                            className="px-4 py-1.5 text-sm font-semibold text-white bg-red-600 hover:bg-red-500 rounded-lg transition-all shadow-sm disabled:opacity-40"
                          >
                            {saving === u.id + "_role" ? "…" : u.role === "admin" ? "→ Analyst" : "→ Admin"}
                          </button>
                          <button
                            onClick={() => toggleActive(u)}
                            disabled={saving === u.id + "_active"}
                            className="px-4 py-1.5 text-sm font-semibold text-white bg-red-600 hover:bg-red-500 rounded-lg transition-all shadow-sm disabled:opacity-40"
                          >
                            {saving === u.id + "_active" ? "…" : u.active ? "Deactivate" : "Reactivate"}
                          </button>
                        </>
                      )}
                      {isSelf(u) && (
                        <span className="text-[11px] text-gray-700 italic">Current session</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-6 text-[11px] text-gray-700">
        <span className="flex items-center gap-1.5"><RoleBadge role="admin" /> — Full access, can manage users and settings</span>
        <span className="flex items-center gap-1.5"><RoleBadge role="analyst" /> — Read-only; can acknowledge alerts</span>
      </div>
    </div>
  );
}
