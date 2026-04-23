import { useState, useEffect } from "react";
import { api } from "../api";

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

function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded border text-sm font-semibold shadow-2xl
      ${toast.type === "err" ? "bg-red-600/20 border-red-600/40 text-red-400" : "bg-green-600/20 border-green-600/40 text-green-400"}`}>
      {toast.msg}
    </div>
  );
}

// ── TOTP Setup Flow ───────────────────────────────────────────────────────────

function TOTPSetup({ onDone }) {
  const [step, setStep]       = useState("init"); // init | qr | confirm | done
  const [qrData, setQrData]   = useState(null);
  const [code, setCode]       = useState("");
  const [error, setError]     = useState("");
  const [loading, setLoading] = useState(false);

  async function startSetup() {
    setLoading(true);
    setError("");
    try {
      const data = await api.totpSetup();
      setQrData(data);
      setStep("qr");
    } catch {
      setError("Failed to start 2FA setup.");
    } finally {
      setLoading(false);
    }
  }

  async function confirmCode() {
    if (code.length !== 6) { setError("Enter the 6-digit code."); return; }
    setLoading(true);
    setError("");
    try {
      await api.totpConfirm(code);
      setStep("done");
      setTimeout(() => onDone(true), 1500);
    } catch (e) {
      setError(e.message || "Invalid code — try again.");
      setCode("");
    } finally {
      setLoading(false);
    }
  }

  if (step === "init") return (
    <div className="space-y-4">
      <p className="text-sm text-gray-400">
        Two-factor authentication adds a second layer of security. After enabling, you will need your authenticator app each time you sign in.
      </p>
      <div className="bg-blue-500/5 border border-blue-500/20 rounded p-3 text-xs text-gray-500 font-mono space-y-1">
        <p>Compatible apps: Google Authenticator, Authy, Microsoft Authenticator, 1Password</p>
      </div>
      <button
        onClick={startSetup}
        disabled={loading}
        className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold bg-red-600 hover:bg-red-500 text-white rounded-lg transition-all shadow-sm disabled:opacity-40"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        {loading ? "Starting…" : "Set Up Two-Factor Auth"}
      </button>
      {error && <p className="text-xs text-red-400 font-mono">{error}</p>}
    </div>
  );

  if (step === "qr") return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-gray-400 mb-3">
          Scan this QR code with your authenticator app, then enter the 6-digit code to confirm.
        </p>
        <div className="flex justify-center">
          <div className="bg-white p-3 rounded-lg inline-block">
            <img src={`data:image/png;base64,${qrData.qr_png_b64}`} alt="TOTP QR code" className="w-48 h-48" />
          </div>
        </div>
        <div className="mt-3 bg-[#09090b] border border-[#1c1c1f] rounded px-4 py-3">
          <p className="text-[10px] uppercase tracking-widest text-gray-600 mb-1">Manual entry key</p>
          <p className="text-xs font-mono text-gray-300 break-all">{qrData.secret}</p>
        </div>
      </div>
      <div>
        <label className="block text-xs uppercase tracking-widest text-gray-500 mb-1.5">Confirmation Code</label>
        <input
          type="text"
          inputMode="numeric"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ""))}
          placeholder="000000"
          autoFocus
          className="w-full bg-[#09090b] border border-[#1c1c1f] focus:border-blue-600/40 text-gray-200 text-xl font-mono text-center px-4 py-3 rounded outline-none placeholder-gray-700 tracking-[0.4em] transition-colors"
        />
      </div>
      {error && <p className="text-xs text-red-400 font-mono">{error}</p>}
      <div className="flex gap-3">
        <button
          onClick={confirmCode}
          disabled={loading || code.length !== 6}
          className="flex-1 px-4 py-2.5 text-sm font-semibold bg-red-600 hover:bg-red-500 text-white rounded-lg transition-all shadow-sm disabled:opacity-40"
        >
          {loading ? "Verifying…" : "Enable 2FA"}
        </button>
        <button
          onClick={() => { setStep("init"); setCode(""); setError(""); }}
          className="px-4 py-2.5 text-sm font-medium text-zinc-400 hover:text-white bg-[#1c1c1f] hover:bg-[#27272a] rounded-lg transition-all"
        >
          Cancel
        </button>
      </div>
    </div>
  );

  if (step === "done") return (
    <div className="flex items-center gap-3 bg-green-500/10 border border-green-500/20 rounded px-4 py-3">
      <span className="w-2 h-2 rounded-full bg-green-500 shrink-0"></span>
      <p className="text-sm text-green-400 font-mono">Two-factor authentication enabled successfully.</p>
    </div>
  );

  return null;
}

function TOTPDisable({ onDone }) {
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [confirm, setConfirm]   = useState(false);

  async function handleDisable() {
    if (!password) { setError("Enter your current password to confirm."); return; }
    setLoading(true);
    setError("");
    try {
      await api.totpDisable(password);
      onDone(false);
    } catch (e) {
      setError(e.message || "Incorrect password.");
      setPassword("");
    } finally {
      setLoading(false);
    }
  }

  if (!confirm) return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 bg-yellow-500/5 border border-yellow-500/20 rounded p-3">
        <svg className="w-4 h-4 text-yellow-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <p className="text-xs text-yellow-500/80 font-mono">Disabling 2FA reduces account security. You will only need a password to sign in.</p>
      </div>
      <button
        onClick={() => setConfirm(true)}
        className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold bg-red-600 hover:bg-red-500 text-white rounded-lg transition-all shadow-sm"
      >
        Disable Two-Factor Auth
      </button>
    </div>
  );

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs uppercase tracking-widest text-gray-500 mb-1.5">Confirm with your password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => { setPassword(e.target.value); setError(""); }}
          placeholder="Current password"
          autoFocus
          className="w-full bg-[#09090b] border border-[#1c1c1f] focus:border-red-600/40 text-gray-200 text-sm font-mono px-3 py-2.5 rounded outline-none placeholder-gray-700 transition-colors"
        />
      </div>
      {error && <p className="text-xs text-red-400 font-mono">{error}</p>}
      <div className="flex gap-3">
        <button
          onClick={handleDisable}
          disabled={loading}
          className="flex-1 px-4 py-2.5 text-sm font-semibold bg-red-600 hover:bg-red-500 text-white rounded-lg transition-all shadow-sm disabled:opacity-40"
        >
          {loading ? "Disabling…" : "Confirm Disable"}
        </button>
        <button
          onClick={() => { setConfirm(false); setPassword(""); setError(""); }}
          className="px-4 py-2.5 text-sm font-medium text-zinc-400 hover:text-white bg-[#1c1c1f] hover:bg-[#27272a] rounded-lg transition-all"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Security() {
  const [totpEnabled, setTotpEnabled] = useState(false);
  const [loading, setLoading]         = useState(true);
  const [toast, setToast]             = useState(null);

  function showToast(msg, type = "ok") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }

  useEffect(() => {
    api.totpStatus()
      .then((d) => setTotpEnabled(d.totp_enabled))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function handleTotpChange(enabled) {
    setTotpEnabled(enabled);
    showToast(enabled ? "Two-factor authentication enabled." : "Two-factor authentication disabled.");
  }

  if (loading) return (
    <div className="flex items-center gap-3 text-gray-600 text-sm font-mono py-12">
      <span className="w-2 h-2 rounded-full bg-gray-600 animate-pulse"></span>
      Loading security settings…
    </div>
  );

  return (
    <div className="space-y-6 max-w-2xl">
      <Toast toast={toast} />

      <div>
        <h1 className="text-lg font-bold text-white tracking-wide">Account Security</h1>
        <p className="text-xs text-gray-600 mt-0.5">Manage two-factor authentication and account protection settings</p>
      </div>

      {/* ── 2FA status card ── */}
      <div className={`rounded border p-5 flex items-start gap-4 ${totpEnabled ? "bg-green-500/5 border-green-500/20" : "bg-[#111113] border-[#1c1c1f]"}`}>
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${totpEnabled ? "bg-green-600/15 border border-green-600/30" : "bg-[#09090b] border border-[#1c1c1f]"}`}>
          <svg className={`w-5 h-5 ${totpEnabled ? "text-green-400" : "text-gray-600"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        </div>
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <p className="text-sm font-semibold text-gray-200">Two-Factor Authentication</p>
            <span className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest rounded ${totpEnabled ? "bg-green-500/20 text-green-400" : "bg-gray-700/50 text-gray-500"}`}>
              {totpEnabled ? "Enabled" : "Disabled"}
            </span>
          </div>
          <p className="text-xs text-gray-500 font-mono">
            {totpEnabled
              ? "Your account is protected with TOTP-based 2FA. A code from your authenticator app is required on each sign in."
              : "Your account relies on password only. Enable 2FA for stronger protection against unauthorized access."}
          </p>
        </div>
      </div>

      {/* ── Setup or disable ── */}
      <Section title={totpEnabled ? "Manage Two-Factor Authentication" : "Enable Two-Factor Authentication"} accent={totpEnabled ? "border-yellow-900/30" : "border-blue-900/30"}>
        {totpEnabled
          ? <TOTPDisable onDone={handleTotpChange} />
          : <TOTPSetup onDone={handleTotpChange} />
        }
      </Section>

      {/* ── Security tips ── */}
      <div className="bg-[#111113] border border-[#1c1c1f] rounded p-5">
        <p className="text-xs uppercase tracking-widest text-gray-500 font-semibold mb-3">Security Recommendations</p>
        <div className="space-y-2 text-xs text-gray-600 font-mono leading-relaxed">
          <p>— Use a unique, strong password not shared with other services.</p>
          <p>— Enable 2FA — even a compromised password won't allow sign-in without your device.</p>
          <p>— Review active sessions regularly and revoke any unrecognized devices.</p>
          <p>— SSO accounts (Microsoft 365) inherit security from your identity provider.</p>
        </div>
      </div>
    </div>
  );
}
