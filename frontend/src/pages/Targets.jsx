import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { fmtDateTime, fmtDate, fmtShort } from "../utils/dates";

const SERVICES = [
  { key: null,          label: "All Services"   },
  { key: "leaklookup", label: "Leak-Lookup"    },
  { key: "leakcheck",  label: "LeakCheck"      },
  { key: "breach",     label: "BreachDirectory" },
  { key: "paste",      label: "Paste Sites"    },
  { key: "intelx",     label: "IntelligenceX"  },
  { key: "telegram",   label: "Telegram"       },
  { key: "ctifeeds",   label: "CTI Feeds"      },
];

const SEV_PILL = {
  CRITICAL: "bg-red-500/15 text-red-400 border border-red-500/25",
  HIGH:     "bg-orange-500/15 text-orange-400 border border-orange-500/25",
  MEDIUM:   "bg-yellow-500/15 text-yellow-400 border border-yellow-500/25",
  LOW:      "bg-blue-500/15 text-blue-400 border border-blue-500/25",
};

const SOURCE_LABELS = {
  leaklookup: "Leak-Lookup",
  leakcheck:  "LeakCheck",
  breach:     "BreachDirectory",
  paste:      "Paste Sites",
  intelx:     "IntelligenceX",
  telegram:   "Telegram",
  ctifeeds:   "CTI Feeds",
};

function TargetStats({ targetId, refreshKey }) {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    api.getTargetStats(targetId).then(setStats).catch(() => {});
  }, [targetId, refreshKey]);

  if (!stats || stats.total === 0) return (
    <p className="text-xs text-gray-700 mt-2 font-mono">No findings recorded.</p>
  );

  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {Object.entries(stats.by_source).map(([source, data]) => (
        <div key={source} className="flex items-center gap-2 text-sm">
          <span className="text-gray-500 font-medium">{SOURCE_LABELS[source] || source}</span>
          {["CRITICAL", "HIGH", "MEDIUM", "LOW"].map((sev) =>
            data[sev] ? (
              <span key={sev} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${SEV_PILL[sev]}`}>
                <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80"></span>
                {sev.charAt(0) + sev.slice(1).toLowerCase()}
                <span className="font-bold ml-0.5">{data[sev]}</span>
                {data[sev] > 1 ? " records" : " record"}
              </span>
            ) : null
          )}
        </div>
      ))}
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-500/10 text-red-400 border border-red-500/20">
        {stats.total} total
      </span>
    </div>
  );
}

function ScanHistoryPanel({ targetId, onClose }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getScanHistory(targetId)
      .then(setHistory)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [targetId]);

  return (
    <div className="mt-3 bg-[#09090b] border border-[#1c1c1f] rounded-lg">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#1c1c1f]">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Scan History</p>
        <button onClick={onClose} className="text-gray-700 hover:text-gray-400 transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      {loading ? (
        <p className="text-sm text-gray-700 font-mono px-4 py-3">Loading…</p>
      ) : history.length === 0 ? (
        <p className="text-sm text-gray-700 font-mono px-4 py-3">No scan history yet for this target.</p>
      ) : (
        <div className="max-h-52 overflow-y-auto">
          <table className="w-full text-sm font-mono">
            <thead className="sticky top-0 bg-[#09090b]">
              <tr className="border-b border-[#1c1c1f]">
                <th className="text-left px-4 py-2 text-xs text-gray-600 uppercase tracking-wider">Time</th>
                <th className="text-left px-4 py-2 text-xs text-gray-600 uppercase tracking-wider">Monitor</th>
                <th className="text-left px-4 py-2 text-xs text-gray-600 uppercase tracking-wider">Findings</th>
                <th className="text-left px-4 py-2 text-xs text-gray-600 uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id} className="border-b border-[#1c1c1f] last:border-0">
                  <td className="px-4 py-2 text-gray-600">{fmtDateTime(h.ran_at)}</td>
                  <td className="px-4 py-2 text-gray-400 uppercase tracking-wide">{SOURCE_LABELS[h.monitor] || h.monitor || "All"}</td>
                  <td className={`px-4 py-2 font-bold ${h.findings > 0 ? "text-red-400" : "text-gray-600"}`}>{h.findings}</td>
                  <td className="px-4 py-2">
                    <span className={`${h.status === "ok" ? "text-green-500" : "text-red-400"}`}>
                      {h.status === "ok" ? "OK" : "Error"}
                    </span>
                    {h.error_msg && <span className="text-gray-700 ml-1">— {h.error_msg.slice(0, 40)}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function TargetRow({ target: t, onDelete, onScanStart, globalScanning, globalStatsKey }) {
  const [rowScanning, setRowScanning] = useState(false);
  const [selectedService, setSelectedService] = useState(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [statsKey, setStatsKey] = useState(0);
  const [showHistory, setShowHistory] = useState(false);
  const wasScanning = useRef(false);

  useEffect(() => {
    if (wasScanning.current && !globalScanning) {
      setRowScanning(false);
      setStatsKey((k) => k + 1);
    }
    wasScanning.current = globalScanning;
  }, [globalScanning]);

  async function handleRowScan(serviceKey) {
    setDropdownOpen(false);
    setRowScanning(true);
    onScanStart();
    // Normalise: null / undefined → pass nothing (all services)
    const monitorKey = serviceKey === null || serviceKey === undefined ? null : serviceKey;
    try {
      await api.runScanForTarget(t.id, monitorKey);
    } finally {
      const poll = setInterval(async () => {
        try {
          const s = await fetch(`${import.meta.env.VITE_API_URL || "http://localhost:8000/api"}/scan/status`).then((r) => r.json());
          if (!s.running) {
            clearInterval(poll);
            setRowScanning(false);
            setStatsKey((k) => k + 1);
          }
        } catch {
          clearInterval(poll);
          setRowScanning(false);
        }
      }, 800);
    }
  }

  const selectedLabel = SERVICES.find((s) => s.key === selectedService)?.label || "All Services";

  return (
    <div className="border-b border-[#1c1c1f] last:border-0 px-5 py-4">
      <div className="flex items-start justify-between gap-4">
        {/* Left — target info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {t.domain && (
              <span className="text-sm font-semibold text-white border border-[#2a2a2e] bg-white/[0.03] px-2.5 py-0.5 rounded font-mono">
                {t.domain}
              </span>
            )}
            {t.email_pattern && (
              <span className="text-sm text-gray-400 font-mono bg-white/5 border border-[#1c1c1f] px-2.5 py-0.5 rounded">
                {t.email_pattern}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-600 mt-1.5 font-mono">
            Added {fmtDate(t.added_at)}
          </p>
          <TargetStats targetId={t.id} refreshKey={statsKey + globalStatsKey} />
          {showHistory && (
            <ScanHistoryPanel targetId={t.id} onClose={() => setShowHistory(false)} />
          )}
        </div>

        {/* Right — action buttons */}
        <div className="flex items-center gap-2 shrink-0 mt-1">
          {/* Scan split button */}
          <div className="relative flex">
            <button
              onClick={() => handleRowScan(selectedService)}
              disabled={globalScanning || rowScanning}
              className="flex items-center gap-1.5 text-sm font-medium bg-[#1c1c1f] hover:bg-[#27272a] border border-[#2a2a2e] text-gray-300 px-3 py-1.5 rounded-l-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <svg className="w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              {rowScanning ? "Scanning…" : selectedService ? selectedLabel : "Scan all"}
            </button>
            <button
              onClick={() => setDropdownOpen((o) => !o)}
              disabled={globalScanning || rowScanning}
              className="text-sm bg-[#1c1c1f] hover:bg-[#27272a] border-y border-r border-[#2a2a2e] text-gray-500 hover:text-gray-300 px-2 py-1.5 rounded-r-lg transition-all disabled:opacity-40"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {dropdownOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setDropdownOpen(false)} />
                <div className="absolute right-0 top-full mt-1 z-20 bg-[#111113] border border-[#1c1c1f] rounded-lg shadow-xl min-w-44 overflow-hidden">
                  {SERVICES.map((s) => (
                    <button
                      key={String(s.key)}
                      onClick={() => { setSelectedService(s.key); handleRowScan(s.key); }}
                      className={`w-full text-left text-sm px-3 py-2.5 transition-colors
                        ${selectedService === s.key
                          ? "bg-red-500/10 text-red-400"
                          : "text-gray-400 hover:text-gray-200 hover:bg-white/5"}`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* History button */}
          <button
            onClick={() => setShowHistory((v) => !v)}
            className={`text-sm font-medium px-3 py-1.5 rounded-lg border transition-all
              ${showHistory
                ? "bg-blue-500/10 border-blue-500/20 text-blue-400"
                : "bg-[#1c1c1f] border-[#2a2a2e] text-gray-400 hover:text-gray-200 hover:bg-[#27272a]"}`}
          >
            History
          </button>

          {/* Delete button */}
          <button
            onClick={() => onDelete(t.id)}
            className="p-1.5 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

function ScanProgress({ onDone }) {
  const [status, setStatus] = useState(null);
  const intervalRef = useRef(null);

  useEffect(() => {
    intervalRef.current = setInterval(async () => {
      try {
        const s = await fetch(`${import.meta.env.VITE_API_URL || "http://localhost:8000/api"}/scan/status`).then((r) => r.json());
        setStatus(s);
        if (!s.running) {
          clearInterval(intervalRef.current);
          setTimeout(() => { onDone(); }, 1500);
        }
      } catch {
        clearInterval(intervalRef.current);
      }
    }, 800);
    return () => clearInterval(intervalRef.current);
  }, []);

  if (!status) return null;

  const pct  = status.steps_total > 0 ? Math.round((status.steps_done / status.steps_total) * 100) : 0;
  const done = !status.running;

  return (
    <div className={`border rounded-lg p-4 mb-5 font-mono ${done ? "bg-green-500/5 border-green-500/20" : "bg-[#111113] border-[#1c1c1f]"}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-gray-400">{done ? "✓" : "⟳"} {status.step}</span>
        <span className="text-sm text-gray-600">{done ? 100 : pct}%</span>
      </div>
      <div className="w-full bg-[#09090b] rounded-full h-1">
        <div
          className={`h-1 rounded-full transition-all duration-500 ${done ? "bg-green-500" : "bg-red-500"}`}
          style={{ width: `${done ? 100 : pct}%` }}
        />
      </div>
      {done && (
        <p className={`text-sm mt-2.5 ${status.new_alerts > 0 ? "text-red-400" : "text-green-500"}`}>
          {status.new_alerts > 0
            ? `${status.new_alerts} new finding(s) detected — review dashboard.`
            : "Scan complete. No new threats detected."}
        </p>
      )}
    </div>
  );
}

const fmtDatetime = fmtShort;

function ScheduledScansPanel({ targets }) {
  const [scans, setScans]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [runAt, setRunAt]         = useState("");
  const [targetId, setTargetId]   = useState("");
  const [monitor, setMonitor]     = useState("");
  const [adding, setAdding]       = useState(false);
  const [err, setErr]             = useState("");

  async function loadScans() {
    try { setScans(await api.getScheduledScans()); }
    catch {}
    finally { setLoading(false); }
  }

  useEffect(() => { loadScans(); }, []);

  async function handleSchedule(e) {
    e.preventDefault();
    if (!runAt) { setErr("Pick a date and time."); return; }
    setAdding(true);
    setErr("");
    try {
      const body = {
        run_at: new Date(runAt).toISOString(),
        target_id: targetId ? Number(targetId) : null,
        monitor: monitor || null,
      };
      const s = await api.scheduleScan(body);
      setScans((prev) => [...prev, s]);
      setRunAt("");
      setTargetId("");
      setMonitor("");
    } catch (e) {
      setErr(e.message || "Failed to schedule scan.");
    } finally {
      setAdding(false);
    }
  }

  async function handleCancel(id) {
    try {
      await api.cancelScheduledScan(id);
      setScans((prev) => prev.filter((s) => s.id !== id));
    } catch {}
  }

  const STATUS_COLORS = { pending: "text-yellow-400", running: "text-blue-400", done: "text-green-400", cancelled: "text-gray-600" };

  return (
    <div className="bg-[#111113] border border-[#1c1c1f] rounded-lg mt-5">
      <div className="px-5 py-3.5 border-b border-[#1c1c1f]">
        <p className="text-sm font-semibold text-gray-300">Scheduled scans</p>
      </div>
      <div className="p-5 space-y-4">
        {/* Schedule form */}
        <form onSubmit={handleSchedule} className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Date &amp; Time</label>
            <input
              type="datetime-local"
              value={runAt}
              onChange={(e) => setRunAt(e.target.value)}
              className="bg-[#09090b] border border-[#1c1c1f] focus:border-red-600/30 text-gray-200 text-sm font-mono px-3 py-2 rounded-lg outline-none transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Target</label>
            <select
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              className="bg-[#09090b] border border-[#1c1c1f] text-gray-300 text-sm font-mono px-3 py-2 rounded-lg outline-none focus:border-red-600/30 transition-colors"
            >
              <option value="">All targets</option>
              {targets.map((t) => (
                <option key={t.id} value={t.id}>{t.domain || t.email_pattern}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Source</label>
            <select
              value={monitor}
              onChange={(e) => setMonitor(e.target.value)}
              className="bg-[#09090b] border border-[#1c1c1f] text-gray-300 text-sm font-mono px-3 py-2 rounded-lg outline-none focus:border-red-600/30 transition-colors"
            >
              {SERVICES.map((s) => (
                <option key={String(s.key)} value={s.key ?? ""}>{s.label}</option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={adding}
            className="font-semibold bg-red-600 hover:bg-red-500 text-white rounded-lg transition-all disabled:opacity-40 shadow-sm"
            style={{ fontSize: "16px", padding: "12px 24px" }}
          >
            {adding ? "Scheduling…" : "Schedule scan"}
          </button>
        </form>
        {err && <p className="text-sm text-red-400 font-mono">{err}</p>}

        {/* Pending scans list */}
        {loading ? (
          <p className="text-sm text-gray-700 font-mono">Loading…</p>
        ) : scans.length === 0 ? (
          <p className="text-sm text-gray-600 font-mono">No scheduled scans.</p>
        ) : (
          <div className="space-y-1.5">
            {scans.map((s) => {
              const tgt = targets.find((t) => t.id === s.target_id);
              return (
                <div key={s.id} className="flex items-center justify-between gap-3 px-3 py-2.5 bg-[#09090b] border border-[#1c1c1f] rounded-lg font-mono text-sm">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`font-semibold uppercase text-xs tracking-wider ${STATUS_COLORS[s.status] || "text-gray-500"}`}>{s.status}</span>
                    <span className="text-gray-400">{fmtDatetime(s.run_at)}</span>
                    <span className="text-gray-600 truncate">{tgt ? (tgt.domain || tgt.email_pattern) : "All targets"}</span>
                    {s.monitor && <span className="text-gray-700">{SOURCE_LABELS[s.monitor] || s.monitor}</span>}
                  </div>
                  {s.status === "pending" && (
                    <button
                      onClick={() => handleCancel(s.id)}
                      className="text-gray-700 hover:text-red-400 transition-colors shrink-0"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Targets() {
  const [targets, setTargets]           = useState([]);
  const [domain, setDomain]             = useState("");
  const [email, setEmail]               = useState("");
  const [scanning, setScanning]         = useState(false);
  const [error, setError]               = useState("");
  const [globalStatsKey, setGlobalStatsKey] = useState(0);

  async function load() {
    const data = await api.getTargets();
    setTargets(data);
  }

  useEffect(() => { load(); }, []);

  async function handleAdd(e) {
    e.preventDefault();
    setError("");
    if (!domain.trim() && !email.trim()) { setError("Enter a domain or email."); return; }
    try {
      await api.addTarget({
        domain:        domain.trim() || undefined,
        email_pattern: email.trim()  || undefined,
      });
      setDomain("");
      setEmail("");
      await load();
    } catch {
      setError("Failed to add target.");
    }
  }

  async function handleDelete(id) {
    await api.deleteTarget(id);
    setTargets((t) => t.filter((x) => x.id !== id));
  }

  async function handleScan() {
    setScanning(true);
    await api.runScan();
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-bold text-white tracking-wide">Monitored Targets</h1>
          <p className="text-sm text-gray-600 mt-0.5">Domains and emails under active surveillance</p>
        </div>
        <button
          onClick={handleScan}
          disabled={scanning}
          className="flex items-center gap-2 font-semibold bg-red-600 hover:bg-red-500 text-white rounded-lg transition-all disabled:opacity-40 shadow-sm"
          style={{ fontSize: "16px", padding: "12px 24px" }}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          {scanning ? "Scanning…" : "Run full scan"}
        </button>
      </div>

      {scanning && (
        <ScanProgress onDone={() => { setScanning(false); setGlobalStatsKey((k) => k + 1); }} />
      )}

      {/* Add target */}
      <div className="bg-[#111113] border border-[#1c1c1f] rounded-lg p-5 mb-5">
        <p className="text-sm font-semibold text-gray-400 mb-3">Add monitoring target</p>
        <form onSubmit={handleAdd} className="flex flex-wrap gap-3">
          <input
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="Domain — e.g. mycompany.com"
            className="flex-1 min-w-48 bg-[#09090b] border border-[#1c1c1f] focus:border-red-600/30 text-gray-200 text-sm font-mono px-3 py-2.5 rounded-lg outline-none placeholder-gray-700 transition-colors"
          />
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email — e.g. ceo@mycompany.com"
            className="flex-1 min-w-48 bg-[#09090b] border border-[#1c1c1f] focus:border-red-600/30 text-gray-200 text-sm font-mono px-3 py-2.5 rounded-lg outline-none placeholder-gray-700 transition-colors"
          />
          <button
            type="submit"
            className="flex items-center gap-1.5 text-sm font-semibold bg-red-600 hover:bg-red-500 text-white px-4 py-2.5 rounded-lg transition-all shadow-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add target
          </button>
        </form>
        {error && <p className="text-sm text-red-400 font-mono mt-2">{error}</p>}
        <p className="text-xs text-gray-700 font-mono mt-2">
          Only add domains or emails you own or have written authorization to monitor.
        </p>
      </div>

      {/* Target list */}
      {targets.length === 0 ? (
        <div className="text-center py-20 border border-dashed border-[#1c1c1f] rounded-lg">
          <div className="w-10 h-10 rounded-lg border border-[#1c1c1f] flex items-center justify-center mx-auto mb-3">
            <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
          </div>
          <p className="text-sm text-gray-600 font-mono">No targets configured.</p>
          <p className="text-xs text-gray-700 font-mono mt-1">Add a domain or email above to begin monitoring.</p>
        </div>
      ) : (
        <div className="bg-[#111113] border border-[#1c1c1f] rounded-lg">
          <div className="px-5 py-3.5 border-b border-[#1c1c1f] flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-300">Active targets</p>
            <p className="text-sm text-gray-600 font-mono">{targets.length} configured</p>
          </div>
          {targets.map((t) => (
            <TargetRow
              key={t.id}
              target={t}
              onDelete={handleDelete}
              onScanStart={() => setScanning(true)}
              globalScanning={scanning}
              globalStatsKey={globalStatsKey}
            />
          ))}
        </div>
      )}

      <ScheduledScansPanel targets={targets} />
    </div>
  );
}
