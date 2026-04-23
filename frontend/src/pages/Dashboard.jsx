import { useEffect, useState } from "react";
import { AlertCard } from "../components/AlertCard";
import { api } from "../api";

const SEVERITIES = ["", "CRITICAL", "HIGH", "MEDIUM", "LOW"];
const SOURCES    = ["", "hibp", "breach", "paste", "telegram", "leaklookup", "leakcheck", "intelx", "ctifeeds"];

const STAT_META = {
  total:          { label: "Total alerts",  num: "text-zinc-200"   },
  critical:       { label: "Critical",      num: "text-red-400"    },
  high:           { label: "High",          num: "text-orange-400" },
  medium:         { label: "Medium",        num: "text-amber-400"  },
  low:            { label: "Low",           num: "text-blue-400"   },
  unacknowledged: { label: "Open",          num: "text-violet-400" },
};

function StatCard({ statKey, value }) {
  const m = STAT_META[statKey];
  return (
    <div className="bg-[#111113] border border-[#1c1c1f] rounded-xl p-4">
      <p className="text-xs text-zinc-500 font-medium mb-2">{m.label}</p>
      <p className={`text-3xl font-semibold font-mono ${m.num}`}>{value}</p>
    </div>
  );
}

const SEV_LABELS = { "": "All Severities", CRITICAL: "Critical", HIGH: "High", MEDIUM: "Medium", LOW: "Low" };
const SRC_LABELS = { "": "All Sources", hibp: "HIBP", breach: "BreachDir", paste: "Paste", telegram: "Telegram", leaklookup: "Leak-Lookup", leakcheck: "LeakCheck", intelx: "IntelX", ctifeeds: "CTI Feeds" };
const ACK_LABELS = { "": "All Alerts", false: "Open", true: "Closed" };

function FilterSelect({ value, options, labels, onChange }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="text-sm font-medium bg-[#111113] border border-[#1c1c1f] text-zinc-400 rounded-lg px-3 py-1.5 focus:outline-none hover:border-[#27272a] focus:border-[#27272a] transition-colors cursor-pointer"
    >
      {options.map((o) => (
        <option key={String(o)} value={o}>{labels[o]}</option>
      ))}
    </select>
  );
}

export default function Dashboard() {
  const [stats,     setStats]     = useState(null);
  const [alerts,    setAlerts]    = useState([]);
  const [users,     setUsers]     = useState([]);
  const [targets,   setTargets]   = useState([]);
  const [filters,   setFilters]   = useState({ severity: "", source: "", acknowledged: "", target_id: "" });
  const [loading,   setLoading]   = useState(true);
  const [exporting, setExporting] = useState(false);

  async function load() {
    setLoading(true);
    const params = {};
    if (filters.severity)   params.severity = filters.severity;
    if (filters.source)     params.source   = filters.source;
    if (filters.acknowledged !== "") params.acknowledged = filters.acknowledged === "true";
    if (filters.target_id)  params.target_id = filters.target_id;
    // getUsers() is admin-only — catch 403 gracefully so analysts can still use the dashboard
    const [s, a, u, t] = await Promise.all([
      api.getStats(),
      api.getAlerts(params),
      api.getUsers().catch(() => []),
      api.getTargets().catch(() => []),
    ]);
    setStats(s);
    setAlerts(a);
    setUsers(u.filter((usr) => usr.active));
    setTargets(t.filter((tg) => tg.active));
    setLoading(false);
  }

  useEffect(() => { load(); }, [filters]);

  async function handleExportCSV() {
    setExporting(true);
    try {
      const params = {};
      if (filters.severity)   params.severity = filters.severity;
      if (filters.source)     params.source   = filters.source;
      if (filters.acknowledged !== "") params.acknowledged = filters.acknowledged === "true";
      if (filters.target_id)  params.target_id = filters.target_id;
      const res  = await api.exportAlertsCSV(params);
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const el   = document.createElement("a");
      el.href     = url;
      el.download = `breach-tower-alerts-${new Date().toISOString().slice(0, 10)}.csv`;
      el.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("CSV export failed:", err);
      alert("Export failed. Please try again.");
    } finally {
      setExporting(false);
    }
  }

  function handleAcknowledged(id) {
    setAlerts((prev) => prev.map((a) => a.id === id ? { ...a, acknowledged: true } : a));
    setStats((s) => s ? { ...s, unacknowledged: Math.max(0, s.unacknowledged - 1) } : s);
  }

  function handleAlertUpdated(updated) {
    setAlerts((prev) => prev.map((a) => a.id === updated.id ? updated : a));
  }

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Threat Intelligence</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Real-time credential exposure monitoring</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCSV}
            disabled={exporting}
            className="flex items-center gap-1.5 text-sm font-semibold text-white bg-red-600 hover:bg-red-500 px-4 py-2 rounded-lg transition-all disabled:opacity-40 shadow-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            {exporting ? "Exporting…" : "Export CSV"}
          </button>
          <button
            onClick={load}
            className="flex items-center gap-1.5 text-sm font-semibold text-white bg-red-600 hover:bg-red-500 px-4 py-2 rounded-lg transition-all shadow-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {Object.keys(STAT_META).map((k) => (
            <StatCard key={k} statKey={k} value={stats[k] ?? 0} />
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <FilterSelect value={filters.severity}     options={SEVERITIES}             labels={SEV_LABELS} onChange={(v) => setFilters((f) => ({ ...f, severity: v }))} />
        <FilterSelect value={filters.source}       options={SOURCES}                labels={SRC_LABELS} onChange={(v) => setFilters((f) => ({ ...f, source: v }))} />
        <FilterSelect value={filters.acknowledged} options={["", "false", "true"]}  labels={ACK_LABELS} onChange={(v) => setFilters((f) => ({ ...f, acknowledged: v }))} />

        {/* Target filter — dynamic from loaded targets */}
        <select
          value={filters.target_id}
          onChange={(e) => setFilters((f) => ({ ...f, target_id: e.target.value }))}
          className="text-sm font-medium bg-[#111113] border border-[#1c1c1f] text-zinc-400 rounded-lg px-3 py-1.5 focus:outline-none hover:border-[#27272a] focus:border-[#27272a] transition-colors cursor-pointer"
        >
          <option value="">All Targets</option>
          {targets.map((t) => (
            <option key={t.id} value={t.id}>
              {t.domain || t.email_pattern || `Target #${t.id}`}
            </option>
          ))}
        </select>

        {/* Clear filters button — only shown when any filter is active */}
        {(filters.severity || filters.source || filters.acknowledged || filters.target_id) && (
          <button
            onClick={() => setFilters({ severity: "", source: "", acknowledged: "", target_id: "" })}
            className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 border border-[#1c1c1f] hover:border-[#27272a] px-2.5 py-1.5 rounded-lg transition-colors"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            Clear
          </button>
        )}

        {stats && (
          <span className="ml-auto text-xs text-zinc-600 font-mono">
            {alerts.length} result{alerts.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Alerts */}
      {loading ? (
        <div className="flex items-center gap-2 text-zinc-600 text-sm py-10">
          <span className="w-1.5 h-1.5 rounded-full bg-zinc-600 animate-pulse"></span>
          Loading intelligence data…
        </div>
      ) : alerts.length === 0 ? (
        <div className="text-center py-20 border border-dashed border-[#1c1c1f] rounded-xl">
          <svg className="w-8 h-8 text-zinc-700 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          <p className="text-sm text-zinc-500">No threats detected for current filters.</p>
          <p className="text-xs text-zinc-600 mt-1">All monitored targets are clean.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {alerts.map((a) => (
            <AlertCard key={a.id} alert={a} users={users} onAcknowledged={handleAcknowledged} onUpdated={handleAlertUpdated} />
          ))}
        </div>
      )}
    </div>
  );
}
