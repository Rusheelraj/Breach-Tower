import { createContext, useContext, useEffect, useState } from "react";

const AuthContext = createContext(null);

const TOKEN_KEY = "ds_token";
const USER_KEY  = "ds_user";
const BASE = import.meta.env.VITE_API_URL || "/api";

export function AuthProvider({ children }) {
  const [token, setToken]   = useState(() => localStorage.getItem(TOKEN_KEY) || null);
  const [user, setUser]     = useState(() => {
    try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch { return null; }
  });
  // null = still checking, false = verified invalid, true = verified valid
  const [verified, setVerified] = useState(() => !localStorage.getItem(TOKEN_KEY));

  // On mount, validate any stored token against /api/auth/me
  useEffect(() => {
    const stored = localStorage.getItem(TOKEN_KEY);
    if (!stored) { setVerified(true); return; }

    fetch(`${BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${stored}` },
    })
      .then((r) => {
        if (!r.ok) throw new Error("invalid");
        return r.json();
      })
      .then((data) => {
        // Refresh user info from server in case role changed
        setUser((prev) => ({ ...prev, ...data }));
        setVerified(true);
      })
      .catch(() => {
        // Token is expired or invalid — clear it silently
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        setToken(null);
        setUser(null);
        setVerified(true);
      });
  }, []);

  function login(tokenStr, userData) {
    localStorage.setItem(TOKEN_KEY, tokenStr);
    localStorage.setItem(USER_KEY, JSON.stringify(userData));
    setToken(tokenStr);
    setUser(userData);
    setVerified(true);
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setToken(null);
    setUser(null);
  }

  // Don't render anything until token validity is confirmed — prevents
  // Dashboard mounting with a stale token and spamming 401 polls
  if (!verified) return null;

  return (
    <AuthContext.Provider value={{ token, user, login, logout, isAuthenticated: !!token }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
