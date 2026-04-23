const BASE = import.meta.env.VITE_API_URL || "/api";

function getToken() {
  return localStorage.getItem("ds_token") || "";
}

async function request(path, options = {}) {
  const token = getToken();
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...options,
  });
  if (res.status === 401) {
    // Token expired — clear storage and reload to trigger auth wall
    localStorage.removeItem("ds_token");
    localStorage.removeItem("ds_user");
    window.location.reload();
    throw new Error("Session expired");
  }
  if (!res.ok) {
    let detail = `API error ${res.status}`;
    try { const body = await res.json(); detail = body.detail || detail; } catch {}
    throw new Error(detail);
  }
  return res.json();
}

export const api = {
  getStats:          () => request("/alerts/stats"),
  getAlerts:         (params = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== "")
    ).toString();
    return request(`/alerts${qs ? "?" + qs : ""}`);
  },
  acknowledgeAlert:  (id) => request(`/alerts/${id}/ack`, { method: "POST" }),

  getTargets:        () => request("/targets"),
  addTarget:         (body) => request("/targets", { method: "POST", body: JSON.stringify(body) }),
  deleteTarget:      (id) => request(`/targets/${id}`, { method: "DELETE" }),

  getSettings:       () => request("/settings"),
  saveSettings:      (body) => request("/settings", { method: "POST", body: JSON.stringify(body) }),

  getEnv:            () => request("/env"),
  saveEnv:           (body) => request("/env", { method: "POST", body: JSON.stringify(body) }),

  runScan:           () => request("/scan/run", { method: "POST" }),
  runScanForTarget:  (id, monitor = null) =>
    request(`/scan/run/${id}${monitor ? `?monitor=${monitor}` : ""}`, { method: "POST" }),
  getTargetStats:    (id) => request(`/targets/${id}/stats`),

  // Auth
  me:                () => request("/auth/me"),
  verifyVaultPassword: (password) => request("/auth/vault/verify", { method: "POST", body: JSON.stringify({ password }) }),
  changeVaultPassword: (body) => request("/auth/vault/change-password", { method: "POST", body: JSON.stringify(body) }),

  // User management
  getUsers:          () => request("/users"),
  updateUser:        (id, body) => request(`/users/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deactivateUser:    (id) => request(`/users/${id}`, { method: "DELETE" }),

  // Audit log
  getAuditLogs:      (params = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== "")
    ).toString();
    return request(`/audit${qs ? "?" + qs : ""}`);
  },

  // Alert export (returns raw fetch — not JSON)
  exportAlertsCSV:   (params = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== "")
    ).toString();
    const token = getToken();
    return fetch(`${BASE}/alerts/export/csv${qs ? "?" + qs : ""}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  },

  // Notification tests
  testEmail:         () => request("/settings/test/email", { method: "POST" }),
  testWebhook:       () => request("/settings/test/webhook", { method: "POST" }),

  // Scan history
  getScanHistory:    (id) => request(`/targets/${id}/scan-history`),
  getScanStatus:     () => request("/scan/status"),

  // Telegram channels
  getTelegramChannels:    () => request("/telegram-channels"),
  addTelegramChannel:     (body) => request("/telegram-channels", { method: "POST", body: JSON.stringify(body) }),
  toggleTelegramChannel:  (id) => request(`/telegram-channels/${id}`, { method: "PATCH" }),
  deleteTelegramChannel:  (id) => request(`/telegram-channels/${id}`, { method: "DELETE" }),

  // Telegram session auth
  getTelegramAuthStatus:  () => request("/telegram/auth/status"),
  telegramSendCode:       (phone) => request("/telegram/auth/send-code", { method: "POST", body: JSON.stringify({ phone }) }),
  telegramVerifyCode:     (phone, code) => request("/telegram/auth/verify-code", { method: "POST", body: JSON.stringify({ phone, code }) }),
  telegramRevokeSession:  () => request("/telegram/auth/session", { method: "DELETE" }),

  // Scheduled scans
  getScheduledScans:   () => request("/scheduled-scans"),
  scheduleScan:        (body) => request("/scheduled-scans", { method: "POST", body: JSON.stringify(body) }),
  cancelScheduledScan: (id) => request(`/scheduled-scans/${id}`, { method: "DELETE" }),

  // Session management
  getSessions:    () => request("/sessions"),
  revokeSession:  (id) => request(`/sessions/${id}`, { method: "DELETE" }),
  revokeAllSessions: () => request("/sessions", { method: "DELETE" }),

  // Full granular report data
  getFullReport: () => request("/reports/full"),

  // Alert assignment & notes
  assignAlert:       (id, user_id) => request(`/alerts/${id}/assign`, { method: "POST", body: JSON.stringify({ user_id }) }),
  setAlertNote:      (id, note) => request(`/alerts/${id}/note`, { method: "POST", body: JSON.stringify({ note }) }),
  clearAlertNote:    (id) => request(`/alerts/${id}/note`, { method: "DELETE" }),

  // Trend & comparison data
  getAlertTrends:    (days = 30) => request(`/alerts/trends?days=${days}`),
  getAlertComparison: (period = "week") => request(`/alerts/comparison?period=${period}`),

  // TOTP 2FA
  totpSetup:    () => request("/auth/totp/setup", { method: "POST" }),
  totpConfirm:  (code) => request("/auth/totp/confirm", { method: "POST", body: JSON.stringify({ code }) }),
  totpDisable:  (password) => request("/auth/totp/disable", { method: "POST", body: JSON.stringify({ password }) }),
  totpVerify:   async (partial_token, code) => {
    const r = await fetch(`${BASE}/auth/totp/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ partial_token, code }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.detail || `TOTP verify failed (${r.status})`);
    return data;
  },
  totpStatus:   () => request("/auth/totp/status"),
};
