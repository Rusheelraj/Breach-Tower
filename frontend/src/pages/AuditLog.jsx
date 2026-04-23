import { useState, useEffect, useCallback } from "react";
import { api } from "../api";
import { fmtDateTime } from "../utils/dates";

const ACTION_LABELS = {
  user_login:          { label: "Sign In",           color: "text-blue-400",   bg: "bg-blue-600/10 border-blue-600/20" },
  user_registered:     { label: "Registration",      color: "text-green-400",  bg: "bg-green-600/10 border-green-600/20" },
  user_updated:        { label: "User Updated",       color: "text-yellow-400", bg: "bg-yellow-600/10 border-yellow-600/20" },
  user_deactivated:    { label: "Deactivated",        color: "text-red-400",    bg: "bg-red-600/10 border-red-600/20" },
  alerts_exported:     { label: "Export",             color: "text-purple-400", bg: "bg-purple-600/10 border-purple-600/20" },
  settings_changed:    { label: "Settings",           color: "text-gray-400",   bg: "bg-white/5 border-white/10" },
  test_email_sent:     { label: "Test Email",         color: "text-cyan-400",   bg: "bg-cyan-600/10 border-cyan-600/20" },
  test_webhook_sent:   { label: "Test Webhook",       color: "text-cyan-400",   bg: "bg-cyan-600/10 border-cyan-600/20" },
  vault_pw_changed:    { label: "Vault PW",           color: "text-orange-400", bg: "bg-orange-600/10 border-orange-600/20" },
};

function ActionBadge({ action }) {
  const meta = ACTION_LABELS[action] || { label: action, color: "text-gray-500", bg: "bg-white/5 border-white/10" };
  return (
    <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${meta.bg} ${meta.color}`}>
      {meta.label}
    </span>
  );
}

const fmtDate = fmtDateTime;

const FILTER_ACTIONS = [
  { value: "", label: "All Actions" },
  { value: "user_login", label: "Sign Ins" },
  { value: "user_registered", label: "Registrations" },
  { value: "user_updated", label: "User Updates" },
  { value: "user_deactivated", label: "Deactivations" },
  { value: "alerts_exported", label: "Exports" },
  { value: "test_email_sent", label: "Email Tests" },
  { value: "test_webhook_sent", label: "Webhook Tests" },
];

export default function AuditLog() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  const load = useCallback(() => {
    setLoading(true);
    const params = { limit: PAGE_SIZE, offset: page * PAGE_SIZE };
    if (actionFilter) params.action = actionFilter;
    api.getAuditLogs(params)
      .then(setLogs)
      .catch(() => setError("Failed to load audit log."))
      .finally(() => setLoading(false));
  }, [actionFilter, page]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(0); }, [actionFilter]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold text-white tracking-wide">Audit Log</h1>
          <p className="text-xs text-gray-600 mt-0.5">Track all user actions — scans, logins, settings changes, exports</p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-500 rounded-lg transition-all shadow-sm"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="bg-[#111113] border border-[#1c1c1f] text-gray-300 text-xs rounded px-3 py-2 focus:outline-none focus:border-red-600/40"
        >
          {FILTER_ACTIONS.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>
        {logs.length > 0 && (
          <span className="text-[11px] text-gray-600">
            Showing {page * PAGE_SIZE + 1}–{page * PAGE_SIZE + logs.length}
            {logs.length === PAGE_SIZE ? "+" : ""}
          </span>
        )}
      </div>

      {/* Log table */}
      <div className="bg-[#111113] border border-[#1c1c1f] rounded overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-gray-600 text-sm">Loading…</div>
        ) : error ? (
          <div className="py-16 text-center text-red-500 text-sm">{error}</div>
        ) : logs.length === 0 ? (
          <div className="py-16 text-center space-y-3">
            <svg className="w-10 h-10 text-gray-700 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <p className="text-sm text-gray-600">No audit events found</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#1c1c1f]">
                <th className="text-left px-5 py-3 text-[10px] text-gray-600 uppercase tracking-widest font-semibold">Timestamp</th>
                <th className="text-left px-5 py-3 text-[10px] text-gray-600 uppercase tracking-widest font-semibold">Action</th>
                <th className="text-left px-5 py-3 text-[10px] text-gray-600 uppercase tracking-widest font-semibold">User</th>
                <th className="text-left px-5 py-3 text-[10px] text-gray-600 uppercase tracking-widest font-semibold">Detail</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-b border-[#1c1c1f] last:border-0 hover:bg-white/[0.015] transition-colors">
                  <td className="px-5 py-3 text-xs text-gray-500 whitespace-nowrap font-mono">
                    {fmtDate(log.created_at)}
                  </td>
                  <td className="px-5 py-3">
                    <ActionBadge action={log.action} />
                  </td>
                  <td className="px-5 py-3 text-xs text-gray-400 font-mono">
                    {log.user_email || <span className="text-gray-700 italic">system</span>}
                  </td>
                  <td className="px-5 py-3 text-xs text-gray-600 max-w-sm truncate">
                    {log.detail || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {(page > 0 || logs.length === PAGE_SIZE) && (
        <div className="flex items-center gap-3 justify-end">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="px-4 py-1.5 text-sm font-semibold text-white bg-red-600 hover:bg-red-500 rounded-lg transition-all shadow-sm disabled:opacity-30"
          >
            Previous
          </button>
          <span className="text-xs text-gray-600">Page {page + 1}</span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={logs.length < PAGE_SIZE}
            className="px-4 py-1.5 text-sm font-semibold text-white bg-red-600 hover:bg-red-500 rounded-lg transition-all shadow-sm disabled:opacity-30"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
