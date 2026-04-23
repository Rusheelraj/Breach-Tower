import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { fmtDateTime } from "../utils/dates";

// Vault unlock is verified server-side — no password stored in frontend

// Intelligence monitors — used for coverage % calculation
// noKey: true = always active (no API key required)
const SOURCE_META = [
  { key: "LEAKLOOKUP_API_KEY",   monitorKey: "leaklookup", label: "Leak-Lookup",      color: "text-orange-400",  dot: "bg-orange-500" },
  { key: "LEAKCHECK_API_KEY",    monitorKey: "leakcheck",  label: "LeakCheck",        color: "text-yellow-400",  dot: "bg-yellow-500" },
  { key: "INTELX_API_KEY",       monitorKey: "intelx",     label: "IntelligenceX",    color: "text-blue-400",    dot: "bg-blue-500"   },
  { key: "BREACH_DIRECTORY_KEY", monitorKey: "breach",     label: "BreachDirectory",  color: "text-purple-400",  dot: "bg-purple-500" },
  { key: "TELEGRAM_API_ID",      monitorKey: "telegram",   label: "Telegram",         color: "text-cyan-400",    dot: "bg-cyan-500"   },
  { key: null, noKey: true,      monitorKey: "paste",      label: "Paste Sites",      color: "text-pink-400",    dot: "bg-pink-500"   },
  { key: null, noKey: true,      monitorKey: "ctifeeds",   label: "CTI Feeds",        color: "text-emerald-400", dot: "bg-emerald-500" },
];

// Notification channels — separate from intelligence monitors
const NOTIF_META = [
  { key: "SMTP_PASS",     label: "SMTP",    color: "text-green-400", dot: "bg-green-500" },
  { key: "SLACK_WEBHOOK", label: "Webhook", color: "text-pink-400",  dot: "bg-pink-500"  },
];

// ── helpers ───────────────────────────────────────────────────────────────────

function mask(value) {
  if (!value) return "";
  if (value.length <= 6) return "•".repeat(value.length);
  return value.slice(0, 3) + "•".repeat(Math.min(value.length - 5, 14)) + value.slice(-2);
}

// ── Field ─────────────────────────────────────────────────────────────────────

function Field({ label, type = "text", value, onChange, placeholder, hint, sensitive, locked }) {
  const isMasked = sensitive && locked;
  return (
    <div>
      <label className="flex items-center gap-2 text-xs uppercase tracking-widest text-gray-500 mb-2">
        {label}
        {sensitive && <span className="text-[10px] text-red-500/50 normal-case tracking-normal font-mono">protected</span>}
      </label>
      {isMasked ? (
        <div className="w-full bg-[#09090b] border border-[#1c1c1f] text-sm font-mono px-3 py-2.5 rounded flex items-center gap-2 cursor-not-allowed">
          <svg className="w-3.5 h-3.5 text-gray-700 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <span className="text-gray-600 tracking-widest text-xs">
            {value ? mask(value) : <span className="text-gray-700 italic text-xs">not configured</span>}
          </span>
        </div>
      ) : (
        <input
          type={type}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-[#09090b] border border-[#1c1c1f] focus:border-red-600/40 text-gray-200 text-sm font-mono px-3 py-2.5 rounded outline-none placeholder-gray-700 transition-colors"
        />
      )}
      {hint && !isMasked && <p className="text-xs text-gray-700 font-mono mt-1.5">{hint}</p>}
    </div>
  );
}

// ── Section ───────────────────────────────────────────────────────────────────

function Section({ title, children, accent }) {
  return (
    <div className={`bg-[#111113] border rounded overflow-hidden ${accent || "border-[#1c1c1f]"}`}>
      <div className="px-5 py-3 border-b border-[#1c1c1f]">
        <p className="text-xs uppercase tracking-widest text-gray-400 font-semibold">{title}</p>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

// ── Shared modal shell ────────────────────────────────────────────────────────

function ModalShell({ icon, title, subtitle, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-[#111113] border border-[#1c1c1f] rounded-lg w-full max-w-sm mx-4 p-7 shadow-2xl">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-10 h-10 rounded-lg bg-red-600/15 border border-red-600/30 flex items-center justify-center shrink-0">
            {icon}
          </div>
          <div>
            <p className="text-base font-bold text-white tracking-wide">{title}</p>
            <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

const LockIcon = (
  <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
  </svg>
);

// ── UnlockModal ───────────────────────────────────────────────────────────────

function UnlockModal({ onUnlock, onCancel }) {
  const [pw, setPw]       = useState("");
  const [err, setErr]     = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef          = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  async function attempt() {
    if (!pw) return;
    setLoading(true);
    setErr("");
    try {
      const res = await api.verifyVaultPassword(pw);
      if (res.valid) { onUnlock(); }
      else { setErr("Incorrect password."); setPw(""); }
    } catch {
      setErr("Verification failed. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <ModalShell icon={LockIcon} title="Credential Vault" subtitle="Admin authentication required">
      <input
        ref={inputRef}
        type="password"
        value={pw}
        onChange={(e) => { setPw(e.target.value); setErr(""); }}
        onKeyDown={(e) => e.key === "Enter" && attempt()}
        placeholder="Enter vault password"
        className="w-full bg-[#09090b] border border-[#1c1c1f] focus:border-red-600/40 text-gray-200 text-sm font-mono px-4 py-3 rounded outline-none placeholder-gray-700 transition-colors mb-3"
      />
      {err && <p className="text-red-400 text-xs font-mono mb-3">{err}</p>}
      <div className="flex gap-3">
        <button onClick={attempt} disabled={loading} className="flex-1 text-sm font-semibold bg-red-600 hover:bg-red-500 text-white px-4 py-2.5 rounded-lg transition-all shadow-sm disabled:opacity-40">
          {loading ? "Verifying…" : "Unlock"}
        </button>
        <button onClick={onCancel} className="text-sm font-medium text-zinc-400 hover:text-white bg-[#1c1c1f] hover:bg-[#27272a] px-4 py-2.5 rounded-lg transition-all">
          Cancel
        </button>
      </div>
    </ModalShell>
  );
}

// ── ChangeVaultPasswordModal ──────────────────────────────────────────────────

function ChangeVaultPasswordModal({ onClose }) {
  const [current, setCurrent]   = useState("");
  const [next, setNext]         = useState("");
  const [confirm, setConfirm]   = useState("");
  const [err, setErr]           = useState("");
  const [success, setSuccess]   = useState(false);
  const [loading, setLoading]   = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setErr("");
    if (next !== confirm) { setErr("New passwords do not match."); return; }
    if (next.length < 8)  { setErr("Password must be at least 8 characters."); return; }
    setLoading(true);
    try {
      await api.changeVaultPassword({ current_password: current, new_password: next });
      setSuccess(true);
      setTimeout(onClose, 1800);
    } catch (ex) {
      setErr(ex.message || "Failed to update password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <ModalShell icon={LockIcon} title="Change Vault Password" subtitle="Update the credential vault unlock password">
      {success ? (
        <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/20 rounded px-4 py-3">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
          <p className="text-xs text-green-400 font-mono">Vault password updated successfully.</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3">
          {[
            { label: "Current Password", val: current, set: setCurrent },
            { label: "New Password",     val: next,    set: setNext    },
            { label: "Confirm New",      val: confirm, set: setConfirm },
          ].map(({ label, val, set }) => (
            <div key={label}>
              <label className="block text-xs uppercase tracking-widest text-gray-500 mb-1.5">{label}</label>
              <input
                type="password"
                value={val}
                onChange={(e) => set(e.target.value)}
                className="w-full bg-[#09090b] border border-[#1c1c1f] focus:border-red-600/40 text-gray-200 text-sm font-mono px-3 py-2.5 rounded outline-none placeholder-gray-700 transition-colors"
              />
            </div>
          ))}
          {err && <p className="text-red-400 text-xs font-mono">{err}</p>}
          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={loading} className="flex-1 text-sm font-semibold bg-red-600 hover:bg-red-500 text-white px-4 py-2.5 rounded-lg transition-all shadow-sm disabled:opacity-40">
              {loading ? "Saving…" : "Update Password"}
            </button>
            <button type="button" onClick={onClose} className="text-sm font-medium text-zinc-400 hover:text-white bg-[#1c1c1f] hover:bg-[#27272a] px-4 py-2.5 rounded-lg transition-all">
              Cancel
            </button>
          </div>
        </form>
      )}
    </ModalShell>
  );
}

// ── StatusPanel (right column) ────────────────────────────────────────────────

function StatusPanel({ envForm, scanStatus, stats, lastRefresh }) {
  const disabled   = new Set((envForm.DISABLED_MONITORS || "").split(",").map((s) => s.trim()).filter(Boolean));

  // A monitor is "active" if: not disabled AND (no key required OR key is set)
  const activeMonitors = SOURCE_META.filter((s) =>
    !disabled.has(s.monitorKey) && (s.noKey || !!envForm[s.key])
  );
  const coveragePct = Math.round((activeMonitors.length / SOURCE_META.length) * 100);

  return (
    <div className="space-y-4">

      {/* ── Coverage gauge ── */}
      <div className="bg-[#111113] border border-[#1c1c1f] rounded overflow-hidden">
        <div className="px-5 py-3 border-b border-[#1c1c1f]">
          <p className="text-xs uppercase tracking-widest text-gray-400 font-semibold">Intelligence Coverage</p>
        </div>
        <div className="p-5">
          <div className="flex items-end justify-between mb-2">
            <span className={`text-4xl font-bold font-mono ${coveragePct === 100 ? "text-green-400" : coveragePct >= 60 ? "text-yellow-400" : "text-red-400"}`}>
              {coveragePct}%
            </span>
            <span className="text-xs text-gray-600 font-mono mb-1">{activeMonitors.length} / {SOURCE_META.length} sources active</span>
          </div>
          <div className="w-full bg-[#09090b] rounded-full h-1.5 mb-4">
            <div
              className={`h-1.5 rounded-full transition-all duration-700 ${coveragePct === 100 ? "bg-green-500" : coveragePct >= 60 ? "bg-yellow-500" : "bg-red-500"}`}
              style={{ width: `${coveragePct}%` }}
            />
          </div>
          <div className="space-y-2">
            {SOURCE_META.map((s) => {
              const monitorKey = s.monitorKey;
              const active = s.noKey ? true : !!envForm[s.key];
              const isDisabled = disabled.has(monitorKey);
              return (
                <div key={s.monitorKey} className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isDisabled ? "bg-gray-700" : active ? s.dot : "bg-gray-700"}`}></span>
                    <span className={`text-xs font-mono ${isDisabled || !active ? "text-gray-600" : "text-gray-300"}`}>{s.label}</span>
                  </div>
                  <span className={`text-[10px] uppercase tracking-widest font-semibold ${isDisabled ? "text-gray-700" : active ? s.color : "text-gray-700"}`}>
                    {isDisabled ? "Disabled" : active ? "Active" : "Not Set"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Scan status ── */}
      <div className="bg-[#111113] border border-[#1c1c1f] rounded overflow-hidden">
        <div className="px-5 py-3 border-b border-[#1c1c1f]">
          <p className="text-xs uppercase tracking-widest text-gray-400 font-semibold">Scan Engine</p>
        </div>
        <div className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500 uppercase tracking-widest">Status</span>
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${scanStatus?.running ? "bg-red-500 animate-pulse" : "bg-green-500"}`}></span>
              <span className={`text-xs font-mono font-semibold ${scanStatus?.running ? "text-red-400" : "text-green-400"}`}>
                {scanStatus?.running ? "Scanning" : "Idle"}
              </span>
            </div>
          </div>
          {scanStatus?.running && (
            <div>
              <div className="flex justify-between text-[10px] text-gray-600 mb-1">
                <span className="font-mono truncate max-w-[200px]">{scanStatus.step}</span>
                <span>{scanStatus.steps_total > 0 ? Math.round((scanStatus.steps_done / scanStatus.steps_total) * 100) : 0}%</span>
              </div>
              <div className="w-full bg-[#09090b] rounded-full h-1">
                <div className="h-1 rounded-full bg-red-500 transition-all duration-500"
                  style={{ width: `${scanStatus.steps_total > 0 ? Math.round((scanStatus.steps_done / scanStatus.steps_total) * 100) : 0}%` }} />
              </div>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500 uppercase tracking-widest">Last Scan</span>
            <span className="text-xs font-mono text-gray-400">
              {scanStatus?.last_completed ? fmtDateTime(scanStatus.last_completed) : "Never"}
            </span>
          </div>
          {scanStatus?.new_alerts > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500 uppercase tracking-widest">New Findings</span>
              <span className="text-xs font-mono font-bold text-red-400">{scanStatus.new_alerts}</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Threat summary ── */}
      {stats && (
        <div className="bg-[#111113] border border-[#1c1c1f] rounded overflow-hidden">
          <div className="px-5 py-3 border-b border-[#1c1c1f]">
            <p className="text-xs uppercase tracking-widest text-gray-400 font-semibold">Threat Summary</p>
          </div>
          <div className="p-5 grid grid-cols-2 gap-3">
            {[
              { label: "Total",    value: stats.total,           cls: "text-gray-200" },
              { label: "Open",     value: stats.unacknowledged,  cls: "text-purple-400" },
              { label: "Critical", value: stats.critical,        cls: "text-red-400" },
              { label: "High",     value: stats.high,            cls: "text-orange-400" },
              { label: "Medium",   value: stats.medium,          cls: "text-yellow-400" },
              { label: "Low",      value: stats.low,             cls: "text-blue-400" },
            ].map(({ label, value, cls }) => (
              <div key={label} className="bg-[#09090b] border border-[#1c1c1f] rounded px-3 py-2.5">
                <p className="text-[10px] uppercase tracking-widest text-gray-600 mb-1">{label}</p>
                <p className={`text-2xl font-bold font-mono ${cls}`}>{value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Missing sources warning — only show unconfigured AND enabled sources ── */}
      {SOURCE_META.filter((s) =>
        !s.noKey && !disabled.has(s.monitorKey) && !envForm[s.key]
      ).length > 0 && (
        <div className="bg-yellow-500/5 border border-yellow-500/20 rounded p-4">
          <p className="text-xs uppercase tracking-widest text-yellow-500/80 font-semibold mb-2">Unconfigured Sources</p>
          <p className="text-xs text-gray-500 font-mono mb-3">The following intelligence sources have no API key configured and will be skipped during scans.</p>
          <div className="space-y-1">
            {SOURCE_META.filter((s) =>
              !s.noKey && !disabled.has(s.monitorKey) && !envForm[s.key]
            ).map((s) => (
              <div key={s.monitorKey} className="flex items-center gap-2">
                <span className="w-1 h-1 rounded-full bg-yellow-700"></span>
                <span className="text-xs text-yellow-600/70 font-mono">{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Security notice ── */}
      <div className="bg-[#111113] border border-[#1c1c1f] rounded p-4">
        <p className="text-xs uppercase tracking-widest text-gray-500 font-semibold mb-3">Security Notice</p>
        <div className="space-y-2 text-xs text-gray-600 font-mono leading-relaxed">
          <p>— Credentials are stored in .env and masked by default in the UI.</p>
          <p>— Vault auto-locks after 5 minutes of inactivity.</p>
          <p>— Changes are written directly to disk and take effect immediately.</p>
          <p>— Do not expose this interface to public networks.</p>
        </div>
      </div>

      <p className="text-[10px] text-gray-700 font-mono text-right">
        Last refreshed: {lastRefresh ? lastRefresh.toLocaleTimeString() : "—"}
      </p>
    </div>
  );
}

// ── TelegramAuthPanel ─────────────────────────────────────────────────────────

function TelegramAuthPanel({ hasCredentials }) {
  const [status, setStatus]     = useState(null);   // null | { authenticated, has_credentials }
  const [step, setStep]         = useState("idle");  // idle | phone | code | done | error
  const [phone, setPhone]       = useState("");
  const [code, setCode]         = useState("");
  const [msg, setMsg]           = useState("");
  const [loading, setLoading]   = useState(false);
  const [authedAs, setAuthedAs] = useState("");

  async function loadStatus() {
    try {
      const s = await api.getTelegramAuthStatus();
      setStatus(s);
      if (s.authenticated) setStep("done");
    } catch {
      setStatus({ authenticated: false, has_credentials: hasCredentials });
    }
  }

  useEffect(() => { loadStatus(); }, []);

  async function handleSendCode() {
    if (!phone.trim()) { setMsg("Enter your phone number (e.g. +15551234567)."); return; }
    setLoading(true); setMsg("");
    try {
      await api.telegramSendCode(phone.trim());
      setStep("code");
      setMsg("Code sent! Check your Telegram app.");
    } catch (e) {
      setMsg(e.message || "Failed to send code.");
    } finally { setLoading(false); }
  }

  async function handleVerifyCode() {
    if (!code.trim()) { setMsg("Enter the code from Telegram."); return; }
    setLoading(true); setMsg("");
    try {
      const res = await api.telegramVerifyCode(phone.trim(), code.trim());
      setAuthedAs(res.user || "");
      setStep("done");
      setMsg(res.message || "Authenticated successfully.");
      await loadStatus();
    } catch (e) {
      setMsg(e.message || "Invalid code.");
    } finally { setLoading(false); }
  }

  async function handleRevoke() {
    if (!confirm("Remove Telegram session? The monitor will stop working until re-authenticated.")) return;
    setLoading(true); setMsg("");
    try {
      const res = await api.telegramRevokeSession();
      setStep("idle");
      setCode(""); setPhone("");
      setMsg(res.message || "Session revoked.");
      await loadStatus();
    } catch (e) {
      setMsg(e.message || "Failed to revoke session.");
    } finally { setLoading(false); }
  }

  const credsMissing = !hasCredentials || (status && !status.has_credentials);

  return (
    <div className="mt-4 border border-blue-900/30 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-blue-950/20 border-b border-blue-900/30">
        <div className="flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full shrink-0 ${step === "done" ? "bg-cyan-500" : "bg-gray-700"}`}></div>
          <p className="text-xs uppercase tracking-widest font-semibold text-gray-400">Session Authentication</p>
        </div>
        {step === "done" && (
          <span className="text-[10px] uppercase tracking-widest font-semibold text-cyan-400">Authenticated</span>
        )}
        {step !== "done" && status !== null && (
          <span className="text-[10px] uppercase tracking-widest font-semibold text-gray-600">Not Authenticated</span>
        )}
      </div>

      <div className="p-4 space-y-3">
        {/* Creds missing warning */}
        {credsMissing && (
          <div className="flex items-start gap-2 bg-yellow-500/5 border border-yellow-500/20 rounded px-3 py-2.5">
            <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 shrink-0 mt-1"></span>
            <p className="text-xs text-yellow-500/80 font-mono">Set API ID and API Hash above and save before authenticating.</p>
          </div>
        )}

        {/* Already authenticated */}
        {step === "done" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 bg-cyan-500/5 border border-cyan-500/20 rounded px-3 py-2.5">
              <svg className="w-3.5 h-3.5 text-cyan-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <p className="text-xs text-cyan-400 font-mono">
                {authedAs ? `Authenticated as ${authedAs}` : "Session active — Telegram monitor is running."}
              </p>
            </div>
            <button
              type="button"
              onClick={handleRevoke}
              disabled={loading}
              className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-red-400 hover:text-red-300 bg-red-500/5 hover:bg-red-500/10 border border-red-500/20 rounded transition-all disabled:opacity-40"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              {loading ? "Revoking…" : "Revoke Session"}
            </button>
          </div>
        )}

        {/* Step: enter phone */}
        {(step === "idle" || step === "phone") && !credsMissing && (
          <div className="space-y-2">
            <p className="text-xs text-gray-600 font-mono">Enter the phone number linked to your Telegram account to receive a login code.</p>
            <div className="flex gap-2">
              <input
                type="tel"
                value={phone}
                onChange={(e) => { setPhone(e.target.value); setMsg(""); }}
                onKeyDown={(e) => e.key === "Enter" && handleSendCode()}
                placeholder="+15551234567"
                className="flex-1 bg-[#09090b] border border-[#1c1c1f] focus:border-cyan-600/40 text-gray-200 text-sm font-mono px-3 py-2 rounded outline-none placeholder-gray-700 transition-colors"
              />
              <button
                type="button"
                onClick={handleSendCode}
                disabled={loading || !phone.trim()}
                className="px-4 py-2 text-sm font-semibold bg-cyan-700 hover:bg-cyan-600 text-white rounded-lg transition-all shadow-sm disabled:opacity-40 shrink-0"
              >
                {loading ? "Sending…" : "Send Code"}
              </button>
            </div>
          </div>
        )}

        {/* Step: enter code */}
        {step === "code" && (
          <div className="space-y-2">
            <p className="text-xs text-gray-600 font-mono">Check your Telegram app for the login code and enter it below.</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={code}
                onChange={(e) => { setCode(e.target.value); setMsg(""); }}
                onKeyDown={(e) => e.key === "Enter" && handleVerifyCode()}
                placeholder="12345"
                maxLength={10}
                className="flex-1 bg-[#09090b] border border-[#1c1c1f] focus:border-cyan-600/40 text-gray-200 text-sm font-mono px-3 py-2 rounded outline-none placeholder-gray-700 transition-colors tracking-widest"
              />
              <button
                type="button"
                onClick={handleVerifyCode}
                disabled={loading || !code.trim()}
                className="px-4 py-2 text-sm font-semibold bg-cyan-700 hover:bg-cyan-600 text-white rounded-lg transition-all shadow-sm disabled:opacity-40 shrink-0"
              >
                {loading ? "Verifying…" : "Verify"}
              </button>
            </div>
            <button
              type="button"
              onClick={() => { setStep("idle"); setCode(""); setMsg(""); }}
              className="text-xs text-gray-600 hover:text-gray-400 font-mono transition-colors"
            >
              ← Use a different phone number
            </button>
          </div>
        )}

        {/* Status message */}
        {msg && (
          <p className={`text-xs font-mono ${
            msg.includes("fail") || msg.includes("Invalid") || msg.includes("Error") || msg.includes("must be")
              ? "text-red-400" : "text-cyan-400"
          }`}>{msg}</p>
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Settings() {
  const [dbForm, setDbForm] = useState({
    smtp_host: "", smtp_port: 587, smtp_user: "", smtp_pass: "",
    alert_email: "", slack_webhook: "", scan_interval_hours: 6,
    min_severity_to_alert: "HIGH",
    alert_retention_days: 0,
    siem_webhook_url: "", siem_format: "json",
  });
  const [envForm, setEnvForm] = useState({
    SMTP_HOST: "", SMTP_PORT: "587", SMTP_USER: "", SMTP_PASS: "",
    ALERT_EMAIL: "", SLACK_WEBHOOK: "",
    LEAKLOOKUP_API_KEY: "", LEAKCHECK_API_KEY: "",
    INTELX_API_KEY: "", BREACH_DIRECTORY_KEY: "",
    TELEGRAM_API_ID: "", TELEGRAM_API_HASH: "",
    SCAN_INTERVAL_HOURS: "6",
    DISABLED_MONITORS: "",
  });
  const [tgChannels, setTgChannels]         = useState([]);
  const [tgInput, setTgInput]               = useState("");
  const [tgLabel, setTgLabel]               = useState("");
  const [tgAdding, setTgAdding]             = useState(false);
  const [tgErr, setTgErr]                   = useState("");
  const [scanStatus, setScanStatus]         = useState(null);
  const [stats, setStats]                   = useState(null);
  const [lastRefresh, setLastRefresh]       = useState(null);
  const [loading, setLoading]               = useState(true);
  const [saved, setSaved]                   = useState(false);
  const [saveErr, setSaveErr]               = useState("");
  const [testStatus, setTestStatus]         = useState({ email: null, webhook: null }); // null | "sending" | "ok" | "err"
  const [testMsg, setTestMsg]               = useState({ email: "", webhook: "" });
  const [locked, setLocked]                 = useState(true);
  const [showUnlock, setShowUnlock]         = useState(false);
  const [showChangeVault, setShowChangeVault] = useState(false);
  const lockTimerRef = useRef(null);

  async function loadAll() {
    const [db, env, scan, st, tg] = await Promise.all([
      api.getSettings(), api.getEnv(),
      api.getScanStatus().catch(() => null),
      api.getStats().catch(() => null),
      api.getTelegramChannels().catch(() => []),
    ]);
    setDbForm((f) => ({ ...f, ...db }));
    setEnvForm((f) => ({ ...f, ...env }));
    setScanStatus(scan);
    setStats(st);
    setTgChannels(tg);
    setLastRefresh(new Date());
    setLoading(false);
  }

  async function handleAddChannel() {
    const username = tgInput.trim().replace(/^@/, "");
    if (!username) { setTgErr("Enter a channel username."); return; }
    setTgAdding(true);
    setTgErr("");
    try {
      const ch = await api.addTelegramChannel({ username: `@${username}`, label: tgLabel.trim() || null });
      setTgChannels((c) => [...c, ch]);
      setTgInput("");
      setTgLabel("");
    } catch (e) {
      setTgErr(e.message || "Failed to add channel.");
    } finally {
      setTgAdding(false);
    }
  }

  async function handleToggleChannel(id) {
    try {
      const updated = await api.toggleTelegramChannel(id);
      setTgChannels((cs) => cs.map((c) => c.id === id ? { ...c, enabled: updated.enabled } : c));
    } catch {}
  }

  async function handleDeleteChannel(id) {
    try {
      await api.deleteTelegramChannel(id);
      setTgChannels((cs) => cs.filter((c) => c.id !== id));
    } catch {}
  }

  useEffect(() => { loadAll(); }, []);

  // Poll scan status every 5s when on this page
  useEffect(() => {
    const t = setInterval(async () => {
      const scan = await api.getScanStatus().catch(() => null);
      setScanStatus(scan);
      if (scan && !scan.running) {
        const st = await api.getStats().catch(() => null);
        if (st) setStats(st);
      }
      setLastRefresh(new Date());
    }, 5000);
    return () => clearInterval(t);
  }, []);

  // Idle-based vault lock: reset the 5-minute countdown on any form activity
  function resetLockTimer() {
    if (locked) return;
    clearTimeout(lockTimerRef.current);
    lockTimerRef.current = setTimeout(() => setLocked(true), 5 * 60 * 1000);
  }

  useEffect(() => {
    if (!locked) {
      // Start the initial idle timer when vault is unlocked
      lockTimerRef.current = setTimeout(() => setLocked(true), 5 * 60 * 1000);
      return () => clearTimeout(lockTimerRef.current);
    }
  }, [locked]);

  function setDb(key)  { return (val) => { setDbForm((f)  => ({ ...f, [key]: val })); resetLockTimer(); }; }
  function setEnv(key) { return (val) => { setEnvForm((f) => ({ ...f, [key]: val })); resetLockTimer(); }; }

  async function handleTestEmail() {
    setTestStatus((s) => ({ ...s, email: "sending" }));
    try {
      const res = await api.testEmail();
      setTestStatus((s) => ({ ...s, email: "ok" }));
      setTestMsg((m) => ({ ...m, email: res.detail }));
    } catch (e) {
      setTestStatus((s) => ({ ...s, email: "err" }));
      setTestMsg((m) => ({ ...m, email: e.message || "Test failed." }));
    }
    setTimeout(() => setTestStatus((s) => ({ ...s, email: null })), 4000);
  }

  async function handleTestWebhook() {
    setTestStatus((s) => ({ ...s, webhook: "sending" }));
    try {
      const res = await api.testWebhook();
      setTestStatus((s) => ({ ...s, webhook: "ok" }));
      setTestMsg((m) => ({ ...m, webhook: res.detail }));
    } catch (e) {
      setTestStatus((s) => ({ ...s, webhook: "err" }));
      setTestMsg((m) => ({ ...m, webhook: e.message || "Test failed." }));
    }
    setTimeout(() => setTestStatus((s) => ({ ...s, webhook: null })), 4000);
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaveErr("");
    try {
      const merged = {
        ...dbForm,
        smtp_host:              envForm.SMTP_HOST,
        smtp_port:              Number(envForm.SMTP_PORT) || 587,
        smtp_user:              envForm.SMTP_USER,
        smtp_pass:              envForm.SMTP_PASS,
        alert_email:            envForm.ALERT_EMAIL,
        slack_webhook:          envForm.SLACK_WEBHOOK,
        scan_interval_hours:    Number(envForm.SCAN_INTERVAL_HOURS) || dbForm.scan_interval_hours,
        min_severity_to_alert:  dbForm.min_severity_to_alert,
        alert_retention_days:   Number(dbForm.alert_retention_days) || 0,
        siem_webhook_url:       dbForm.siem_webhook_url,
        siem_format:            dbForm.siem_format,
      };
      await Promise.all([api.saveSettings(merged), api.saveEnv(envForm)]);
      setDbForm(merged);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      setSaveErr("Save failed — verify the backend is running.");
    }
  }

  if (loading) return (
    <div className="flex items-center gap-3 text-gray-600 text-sm font-mono py-12">
      <span className="w-2 h-2 rounded-full bg-gray-600 animate-pulse"></span>
      Loading configuration…
    </div>
  );

  return (
    <div>
      {showUnlock && (
        <UnlockModal
          onUnlock={() => { setLocked(false); setShowUnlock(false); }}
          onCancel={() => setShowUnlock(false)}
        />
      )}
      {showChangeVault && (
        <ChangeVaultPasswordModal
          onClose={() => { setShowChangeVault(false); loadAll(); }}
        />
      )}

      {/* ── Page header ── */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-lg font-bold text-white tracking-wide">Configuration</h1>
          <p className="text-xs text-gray-600 mt-0.5">All settings sync bidirectionally with the .env file</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={loadAll}
            className="flex items-center gap-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-500 px-4 py-2 rounded-lg transition-all shadow-sm"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
          <button
            type="button"
            onClick={() => setShowChangeVault(true)}
            className="flex items-center gap-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-500 px-4 py-2 rounded-lg transition-all shadow-sm"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
            Change Vault Password
          </button>
          {locked ? (
            <button
              type="button"
              onClick={() => setShowUnlock(true)}
              className="flex items-center gap-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-500 px-4 py-2 rounded-lg transition-all shadow-sm"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              Unlock Credentials
            </button>
          ) : (
            <button
              type="button"
              onClick={() => { setLocked(true); clearTimeout(lockTimerRef.current); }}
              className="flex items-center gap-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-500 px-4 py-2 rounded-lg transition-all shadow-sm"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
              </svg>
              Unlocked — Lock Now
            </button>
          )}
        </div>
      </div>

      {!locked && (
        <div className="mb-5 flex items-center gap-3 bg-yellow-500/5 border border-yellow-500/20 rounded px-4 py-3">
          <span className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse shrink-0"></span>
          <p className="text-xs text-yellow-500/80 font-mono uppercase tracking-widest">
            Credentials visible — vault auto-locks in 5 minutes
          </p>
        </div>
      )}

      {/* ── Two-column layout ── */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-6">

        {/* LEFT — config form */}
        <form onSubmit={handleSave} className="space-y-4">

          <Section title="SMTP — Email Alerts">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="SMTP Host"       value={envForm.SMTP_HOST}  onChange={setEnv("SMTP_HOST")}  placeholder="sandbox.smtp.mailtrap.io" sensitive={false} locked={locked} />
              <Field label="SMTP Port"       type="number" value={envForm.SMTP_PORT} onChange={setEnv("SMTP_PORT")} sensitive={false} locked={locked} />
              <Field label="Username"        value={envForm.SMTP_USER}  onChange={setEnv("SMTP_USER")}  placeholder="your_smtp_user" sensitive={false} locked={locked} />
              <Field label="Password"        type="password" value={envForm.SMTP_PASS} onChange={setEnv("SMTP_PASS")} placeholder="••••••••" sensitive={true} locked={locked} />
              <div className="sm:col-span-2">
                <Field label="Alert Recipient" value={envForm.ALERT_EMAIL} onChange={setEnv("ALERT_EMAIL")} placeholder="security@yourcompany.com" sensitive={false} locked={locked} />
              </div>
            </div>
            <div className="mt-4 flex items-center gap-3">
              <button
                type="button"
                onClick={handleTestEmail}
                disabled={testStatus.email === "sending"}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-all disabled:opacity-40 shadow-sm
                  ${testStatus.email === "ok" ? "bg-green-600 hover:bg-green-500 text-white"
                  : testStatus.email === "err" ? "bg-red-700 hover:bg-red-600 text-white"
                  : "bg-red-600 hover:bg-red-500 text-white"}`}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                {testStatus.email === "sending" ? "Sending…" : testStatus.email === "ok" ? "Email Sent" : testStatus.email === "err" ? "Failed" : "Send Test Email"}
              </button>
              {testMsg.email && testStatus.email && (
                <p className={`text-xs font-mono ${testStatus.email === "ok" ? "text-green-500" : "text-red-400"}`}>
                  {testMsg.email}
                </p>
              )}
            </div>
          </Section>

          <Section title="Webhook — Slack / Teams / Discord">
            <Field
              label="Webhook URL"
              value={envForm.SLACK_WEBHOOK}
              onChange={setEnv("SLACK_WEBHOOK")}
              placeholder="https://hooks.slack.com/services/…"
              hint="Supports Slack, Teams, Discord, and any generic incoming webhook."
              sensitive={true}
              locked={locked}
            />
            <div className="mt-4 flex items-center gap-3">
              <button
                type="button"
                onClick={handleTestWebhook}
                disabled={testStatus.webhook === "sending"}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-all disabled:opacity-40 shadow-sm
                  ${testStatus.webhook === "ok" ? "bg-green-600 hover:bg-green-500 text-white"
                  : testStatus.webhook === "err" ? "bg-red-700 hover:bg-red-600 text-white"
                  : "bg-red-600 hover:bg-red-500 text-white"}`}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
                {testStatus.webhook === "sending" ? "Sending…" : testStatus.webhook === "ok" ? "Webhook Sent" : testStatus.webhook === "err" ? "Failed" : "Send Test Webhook"}
              </button>
              {testMsg.webhook && testStatus.webhook && (
                <p className={`text-xs font-mono ${testStatus.webhook === "ok" ? "text-green-500" : "text-red-400"}`}>
                  {testMsg.webhook}
                </p>
              )}
            </div>
          </Section>

          <Section title="API Keys — Intelligence Sources" accent="border-red-900/30">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Leak-Lookup Key"     value={envForm.LEAKLOOKUP_API_KEY}   onChange={setEnv("LEAKLOOKUP_API_KEY")}   placeholder="830a32f8…" sensitive={true} locked={locked} />
              <Field label="LeakCheck Key"       value={envForm.LEAKCHECK_API_KEY}    onChange={setEnv("LEAKCHECK_API_KEY")}    placeholder="580f4005…" sensitive={true} locked={locked} />
              <Field label="IntelligenceX Key"   value={envForm.INTELX_API_KEY}       onChange={setEnv("INTELX_API_KEY")}       placeholder="fd5bdfd0-…" sensitive={true} locked={locked} />
              <Field label="BreachDirectory Key" value={envForm.BREACH_DIRECTORY_KEY} onChange={setEnv("BREACH_DIRECTORY_KEY")} placeholder="RapidAPI key" sensitive={true} locked={locked} />
            </div>
          </Section>

          <Section title="Telegram — Stealer Log Channels" accent="border-blue-900/30">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="API ID"   value={envForm.TELEGRAM_API_ID}   onChange={setEnv("TELEGRAM_API_ID")}   placeholder="12345678" sensitive={true} locked={locked} />
              <Field label="API Hash" value={envForm.TELEGRAM_API_HASH}  onChange={setEnv("TELEGRAM_API_HASH")} placeholder="21d11d9b…" sensitive={true} locked={locked} />
            </div>
            <p className="text-xs text-gray-700 font-mono mt-3">
              Obtain credentials at <span className="text-gray-500">my.telegram.org</span> — save them above, then authenticate your account below.
            </p>
            <TelegramAuthPanel hasCredentials={!!(envForm.TELEGRAM_API_ID && envForm.TELEGRAM_API_HASH)} />
          </Section>

          <Section title="Telegram — Monitored Channels">
            <div className="space-y-3">
              {/* Add channel */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={tgInput}
                  onChange={(e) => { setTgInput(e.target.value); setTgErr(""); }}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddChannel())}
                  placeholder="@ChannelUsername"
                  className="flex-1 bg-[#09090b] border border-[#1c1c1f] focus:border-cyan-600/40 text-gray-200 text-sm font-mono px-3 py-2 rounded outline-none placeholder-gray-700 transition-colors"
                />
                <input
                  type="text"
                  value={tgLabel}
                  onChange={(e) => setTgLabel(e.target.value)}
                  placeholder="Label (optional)"
                  className="w-36 bg-[#09090b] border border-[#1c1c1f] focus:border-cyan-600/40 text-gray-200 text-sm font-mono px-3 py-2 rounded outline-none placeholder-gray-700 transition-colors"
                />
                <button
                  type="button"
                  onClick={handleAddChannel}
                  disabled={tgAdding}
                  className="px-4 py-2 text-sm font-semibold bg-red-600 hover:bg-red-500 text-white rounded-lg transition-all shadow-sm disabled:opacity-40 shrink-0"
                >
                  {tgAdding ? "Adding…" : "Add"}
                </button>
              </div>
              {tgErr && <p className="text-xs text-red-400 font-mono">{tgErr}</p>}
              {/* Channel list */}
              {tgChannels.length === 0 ? (
                <p className="text-xs text-gray-700 font-mono">No custom channels configured. Hardcoded public channels will still be used.</p>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {tgChannels.map((ch) => (
                    <div key={ch.id} className="flex items-center justify-between gap-2 px-3 py-2 bg-[#09090b] border border-[#1c1c1f] rounded">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${ch.enabled ? "bg-cyan-500" : "bg-gray-700"}`}></span>
                        <span className="text-xs font-mono text-gray-300 truncate">{ch.username}</span>
                        {ch.label && <span className="text-[10px] text-gray-600 font-mono truncate">— {ch.label}</span>}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleToggleChannel(ch.id)}
                          className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 transition-colors duration-200
                            ${ch.enabled ? "bg-cyan-600/60 border-cyan-600/40" : "bg-gray-800 border-gray-700"}`}
                        >
                          <span className={`inline-block h-2.5 w-2.5 mt-0.5 rounded-full bg-white shadow transform transition-transform duration-200
                            ${ch.enabled ? "translate-x-2.5" : "translate-x-0.5"}`} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteChannel(ch.id)}
                          className="text-gray-700 hover:text-red-400 transition-colors p-0.5"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Section>

          <Section title="Intelligence Sources — Enable / Disable">
            {(() => {
              const MONITORS = [
                { key: "leaklookup", label: "Leak-Lookup",      color: "text-orange-400",  dot: "bg-orange-500",  envKey: "LEAKLOOKUP_API_KEY" },
                { key: "leakcheck",  label: "LeakCheck",        color: "text-yellow-400",  dot: "bg-yellow-500",  envKey: "LEAKCHECK_API_KEY" },
                { key: "breach",     label: "BreachDirectory",  color: "text-purple-400",  dot: "bg-purple-500",  envKey: "BREACH_DIRECTORY_KEY" },
                { key: "paste",      label: "Paste Sites",      color: "text-pink-400",    dot: "bg-pink-500",    envKey: null },
                { key: "intelx",     label: "IntelligenceX",    color: "text-blue-400",    dot: "bg-blue-500",    envKey: "INTELX_API_KEY" },
                { key: "telegram",   label: "Telegram",         color: "text-cyan-400",    dot: "bg-cyan-500",    envKey: "TELEGRAM_API_ID" },
                { key: "ctifeeds",   label: "CTI Feeds",        color: "text-emerald-400", dot: "bg-emerald-500", envKey: null },
              ];

              const disabled = new Set(
                (envForm.DISABLED_MONITORS || "").split(",").map((s) => s.trim()).filter(Boolean)
              );

              function toggleMonitor(key) {
                const next = new Set(disabled);
                if (next.has(key)) next.delete(key);
                else next.add(key);
                setEnv("DISABLED_MONITORS")([...next].join(","));
              }

              return (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {MONITORS.map((m) => {
                    const isDisabled = disabled.has(m.key);
                    const hasKey = m.envKey ? !!envForm[m.envKey] : true;
                    return (
                      <div
                        key={m.key}
                        className={`flex items-center justify-between px-4 py-3 rounded border transition-all
                          ${isDisabled
                            ? "bg-[#09090b] border-[#1c1c1f] opacity-50"
                            : "bg-[#09090b] border-[#1c1c1f] hover:border-[#27272a]"}`}
                      >
                        <div className="flex items-center gap-3">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${isDisabled ? "bg-gray-700" : m.dot}`}></span>
                          <div>
                            <p className={`text-xs font-semibold font-mono ${isDisabled ? "text-gray-600" : "text-gray-300"}`}>{m.label}</p>
                            {!hasKey && !isDisabled && (
                              <p className="text-[10px] text-yellow-600 font-mono">no api key</p>
                            )}
                            {isDisabled && (
                              <p className="text-[10px] text-gray-700 font-mono uppercase tracking-widest">disabled</p>
                            )}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => toggleMonitor(m.key)}
                          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 transition-colors duration-200 focus:outline-none
                            ${isDisabled ? "bg-gray-800 border-gray-700" : "bg-red-600/60 border-red-600/40"}`}
                        >
                          <span
                            className={`inline-block h-3.5 w-3.5 mt-0.5 rounded-full bg-white shadow transform transition-transform duration-200
                              ${isDisabled ? "translate-x-0.5" : "translate-x-3.5"}`}
                          />
                        </button>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
            <p className="text-xs text-gray-700 font-mono mt-3">
              Disabled sources are skipped during all scans — your API quota is preserved. Settings are saved with the rest of the configuration.
            </p>
          </Section>

          <Section title="Scan Schedule">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs uppercase tracking-widest text-gray-500 mb-2">Scan Interval</label>
                <select
                  value={dbForm.scan_interval_hours}
                  onChange={(e) => { setDb("scan_interval_hours")(Number(e.target.value)); setEnv("SCAN_INTERVAL_HOURS")(e.target.value); }}
                  className="w-full bg-[#09090b] border border-[#1c1c1f] text-gray-200 text-sm font-mono px-3 py-2.5 rounded outline-none focus:border-red-600/40 transition-colors"
                >
                  {[3, 6, 12, 24].map((h) => <option key={h} value={h}>Every {h} hours</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs uppercase tracking-widest text-gray-500 mb-2">Alert Threshold</label>
                <select
                  value={dbForm.min_severity_to_alert}
                  onChange={(e) => setDb("min_severity_to_alert")(e.target.value)}
                  className="w-full bg-[#09090b] border border-[#1c1c1f] text-gray-200 text-sm font-mono px-3 py-2.5 rounded outline-none focus:border-red-600/40 transition-colors"
                >
                  <option value="CRITICAL">Critical only</option>
                  <option value="HIGH">High and above</option>
                  <option value="MEDIUM">Medium and above</option>
                  <option value="LOW">All findings</option>
                </select>
              </div>
            </div>
          </Section>

          <Section title="Data Retention">
            <div className="space-y-3">
              <div>
                <label className="block text-xs uppercase tracking-widest text-gray-500 mb-2">Auto-purge alerts older than</label>
                <div className="flex items-center gap-3">
                  <select
                    value={dbForm.alert_retention_days}
                    onChange={(e) => setDb("alert_retention_days")(Number(e.target.value))}
                    className="w-56 bg-[#09090b] border border-[#1c1c1f] text-gray-200 text-sm font-mono px-3 py-2.5 rounded outline-none focus:border-red-600/40 transition-colors"
                  >
                    <option value={0}>Keep forever</option>
                    <option value={30}>30 days</option>
                    <option value={60}>60 days</option>
                    <option value={90}>90 days</option>
                    <option value={180}>180 days</option>
                    <option value={365}>1 year</option>
                  </select>
                </div>
              </div>
              <p className="text-xs text-gray-700 font-mono">Alerts older than the configured period are automatically deleted every 24 hours. Set to "Keep forever" to disable purging.</p>
            </div>
          </Section>

          <Section title="SIEM Integration" accent="border-red-900/30">
            <div className="space-y-4">
              <Field
                label="SIEM Webhook URL"
                value={dbForm.siem_webhook_url}
                onChange={setDb("siem_webhook_url")}
                placeholder="https://your-splunk/services/collector/event"
                hint="Alerts will be forwarded to this endpoint in real time. Supports Splunk HEC, Elastic, or any JSON receiver."
                sensitive={false}
                locked={false}
              />
              <div>
                <label className="block text-xs uppercase tracking-widest text-gray-500 mb-2">Output Format</label>
                <div className="flex gap-3">
                  {[
                    { val: "json", label: "JSON", desc: "Generic JSON — Elastic, Splunk, webhooks" },
                    { val: "cef",  label: "CEF",  desc: "Common Event Format — ArcSight, QRadar" },
                  ].map((opt) => (
                    <button
                      key={opt.val}
                      type="button"
                      onClick={() => setDb("siem_format")(opt.val)}
                      className={`flex-1 px-4 py-3 rounded border text-left transition-all
                        ${dbForm.siem_format === opt.val
                          ? "bg-red-600/10 border-red-600/40 text-red-300"
                          : "bg-[#09090b] border-[#1c1c1f] text-gray-500 hover:border-[#27272a]"}`}
                    >
                      <p className="text-xs font-bold font-mono">{opt.label}</p>
                      <p className="text-[10px] text-gray-600 font-mono mt-0.5">{opt.desc}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </Section>

          {saveErr && (
            <div className="flex items-center gap-2 bg-red-500/5 border border-red-500/20 rounded px-4 py-3">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0"></span>
              <p className="text-xs text-red-400 font-mono">{saveErr}</p>
            </div>
          )}

          <button
            type="submit"
            className={`text-sm font-semibold px-6 py-3 rounded-lg transition-all shadow-sm
              ${saved
                ? "bg-green-600 hover:bg-green-500 text-white"
                : "bg-red-600 hover:bg-red-500 text-white"}`}
          >
            {saved ? "✓ Saved to .env and database" : "Save Configuration"}
          </button>
        </form>

        {/* RIGHT — status panel */}
        <StatusPanel
          envForm={envForm}
          scanStatus={scanStatus}
          stats={stats}
          lastRefresh={lastRefresh}
        />
      </div>
    </div>
  );
}
