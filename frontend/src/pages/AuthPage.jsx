import { useState, useEffect, useRef } from "react";
import { useMsal } from "@azure/msal-react";
import { useAuth } from "../auth/AuthContext";
import { SSO_ENABLED, loginRequest } from "../auth/msalConfig";

const BASE = import.meta.env.VITE_API_URL || "http://localhost:8000/api";

async function apiPost(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || "Request failed");
  return data;
}

async function apiPostForm(path, fields) {
  const form = new URLSearchParams(fields);
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || "Request failed");
  return data;
}

// ── Full-screen animated canvas background ────────────────────────────────────
function BackgroundCanvas() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let raf;

    const resize = () => {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const W = () => canvas.width;
    const H = () => canvas.height;

    // ── Particles — two layers: background (slow, dim) + foreground (fast, bright) ──
    const makePart = (fast) => ({
      x:  Math.random() * window.innerWidth,
      y:  Math.random() * window.innerHeight,
      r:  fast ? Math.random() * 1.8 + 0.6 : Math.random() * 0.9 + 0.2,
      vx: (Math.random() - 0.5) * (fast ? 0.45 : 0.12),
      vy: (Math.random() - 0.5) * (fast ? 0.45 : 0.12),
      opacity: fast ? Math.random() * 0.55 + 0.2 : Math.random() * 0.25 + 0.05,
      layer: fast ? 1 : 0,
    });
    const particles = [
      ...Array.from({ length: 55 }, () => makePart(false)),
      ...Array.from({ length: 60 }, () => makePart(true)),
    ];
    const N = particles.length;

    // ── Large drifting orbs ──
    const orbs = [
      { x: 0.12, y: 0.20, r: 400, phase: 0,   speed: 0.00035, ox: 80, oy: 50 },
      { x: 0.85, y: 0.65, r: 340, phase: 2.4, speed: 0.00055, ox: 60, oy: 70 },
      { x: 0.50, y: 0.90, r: 280, phase: 4.1, speed: 0.00045, ox: 100,oy: 30 },
      { x: 0.72, y: 0.08, r: 220, phase: 1.2, speed: 0.00065, ox: 50, oy: 60 },
      { x: 0.30, y: 0.55, r: 180, phase: 3.5, speed: 0.0008,  ox: 70, oy: 45 },
    ];

    // ── Triangle grid (matching logo mark) ──
    const tris = [];
    const TRI_SIZE = 60; // half-height of each triangle
    const tcols = Math.ceil(window.innerWidth  / (TRI_SIZE * 1.8)) + 3;
    const trows = Math.ceil(window.innerHeight / (TRI_SIZE * 1.6)) + 3;
    for (let r = -1; r < trows; r++) {
      for (let c = -1; c < tcols; c++) {
        const cx = c * TRI_SIZE * 1.8 + (r % 2 === 0 ? 0 : TRI_SIZE * 0.9);
        const cy = r * TRI_SIZE * 1.4;
        // alternate pointing up and down for variety
        const flip = (r + c) % 2 === 0;
        tris.push({ cx, cy, size: TRI_SIZE * (0.55 + Math.random() * 0.3), flip, phase: Math.random() * Math.PI * 2 });
      }
    }

    // ── Scan lines (two sweepers at different speeds) ──
    let scan1 = 0;
    let scan2 = H() * 0.5;

    // ── Data stream lines (vertical falling streaks) ──
    const streams = Array.from({ length: 18 }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      speed: Math.random() * 1.2 + 0.4,
      len: Math.random() * 80 + 40,
      opacity: Math.random() * 0.12 + 0.03,
    }));

    let t = 0;

    // Equilateral triangle — flip=true points down (inverted)
    function drawTri(cx, cy, size, flip) {
      const h = size * Math.sqrt(3) / 2;
      ctx.beginPath();
      if (!flip) {
        // pointing up (like the logo mark)
        ctx.moveTo(cx,          cy - h * 0.67);
        ctx.lineTo(cx + size/2, cy + h * 0.33);
        ctx.lineTo(cx - size/2, cy + h * 0.33);
      } else {
        // pointing down
        ctx.moveTo(cx,          cy + h * 0.67);
        ctx.lineTo(cx + size/2, cy - h * 0.33);
        ctx.lineTo(cx - size/2, cy - h * 0.33);
      }
      ctx.closePath();
    }

    function draw() {
      t += 1;
      ctx.clearRect(0, 0, W(), H());

      // 1. Deep background
      ctx.fillStyle = "#09090b";
      ctx.fillRect(0, 0, W(), H());

      // 2. Large glow orbs (painted first for depth)
      for (const orb of orbs) {
        const ox = orb.x * W() + Math.sin(t * orb.speed + orb.phase) * orb.ox;
        const oy = orb.y * H() + Math.cos(t * orb.speed * 0.7 + orb.phase) * orb.oy;
        const g = ctx.createRadialGradient(ox, oy, 0, ox, oy, orb.r);
        g.addColorStop(0,   "rgba(220,38,38,0.09)");
        g.addColorStop(0.3, "rgba(220,38,38,0.04)");
        g.addColorStop(0.7, "rgba(185,28,28,0.015)");
        g.addColorStop(1,   "rgba(220,38,38,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(ox, oy, orb.r, 0, Math.PI * 2);
        ctx.fill();
      }

      // 3. Triangle grid — animated pulse glow, logo-matching upward triangles
      for (const tri of tris) {
        const pulse = (Math.sin(t * 0.007 + tri.phase) + 1) / 2; // 0..1
        const alpha = 0.015 + pulse * 0.028;
        ctx.strokeStyle = `rgba(220,38,38,${alpha})`;
        ctx.lineWidth   = 0.7;
        drawTri(tri.cx, tri.cy, tri.size, tri.flip);
        ctx.stroke();

        // Occasional bright triangle flare — like a logo lighting up
        if (pulse > 0.96) {
          ctx.strokeStyle = `rgba(239,68,68,0.22)`;
          ctx.lineWidth   = 1.2;
          drawTri(tri.cx, tri.cy, tri.size, tri.flip);
          ctx.stroke();
          // Faint fill on the brightest ones
          ctx.fillStyle = `rgba(220,38,38,0.03)`;
          ctx.fill();
        }
      }

      // 4. Vertical data stream streaks
      for (const s of streams) {
        s.y += s.speed;
        if (s.y > H() + s.len) { s.y = -s.len; s.x = Math.random() * W(); }
        const sg = ctx.createLinearGradient(s.x, s.y - s.len, s.x, s.y);
        sg.addColorStop(0, "rgba(220,38,38,0)");
        sg.addColorStop(1, `rgba(220,38,38,${s.opacity})`);
        ctx.strokeStyle = sg;
        ctx.lineWidth   = 0.8;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y - s.len);
        ctx.lineTo(s.x, s.y);
        ctx.stroke();
      }

      // 5. Particle connections (foreground layer only)
      for (let i = 0; i < N; i++) {
        if (particles[i].layer === 0) continue;
        for (let j = i + 1; j < N; j++) {
          if (particles[j].layer === 0) continue;
          const dx   = particles[i].x - particles[j].x;
          const dy   = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 150) {
            const alpha = 0.2 * (1 - dist / 150);
            ctx.strokeStyle = `rgba(220,38,38,${alpha})`;
            ctx.lineWidth   = 0.5;
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();
          }
        }
      }

      // 6. Particles — both layers
      for (const p of particles) {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > W()) p.vx *= -1;
        if (p.y < 0 || p.y > H()) p.vy *= -1;

        const pulse = Math.sin(t * 0.02 + p.x * 0.01) * 0.12;
        const alpha = Math.max(0.03, p.opacity + pulse);

        if (p.layer === 1) {
          // Glow halo for foreground particles
          const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 5);
          glow.addColorStop(0, `rgba(220,38,38,${alpha * 0.5})`);
          glow.addColorStop(1, "rgba(220,38,38,0)");
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r * 5, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(220,38,38,${alpha})`;
        ctx.fill();
      }

      // 7. Dual scan line sweepers
      scan1 = (scan1 + 0.5) % H();
      scan2 = (scan2 + 0.28) % H();
      for (const [sy, intensity] of [[scan1, 0.05], [scan2, 0.03]]) {
        const sg = ctx.createLinearGradient(0, sy - 80, 0, sy + 80);
        sg.addColorStop(0,   "rgba(220,38,38,0)");
        sg.addColorStop(0.5, `rgba(220,38,38,${intensity})`);
        sg.addColorStop(1,   "rgba(220,38,38,0)");
        ctx.fillStyle = sg;
        ctx.fillRect(0, sy - 80, W(), 160);
      }

      // 8. Chromatic aberration glitch (rare, short burst)
      if (t % 420 < 4) {
        ctx.globalAlpha = 0.03;
        ctx.drawImage(canvas, 2, 0);
        ctx.globalAlpha = 0.02;
        ctx.drawImage(canvas, -2, 0);
        ctx.globalAlpha = 1;
      }

      // 9. Deep vignette
      const vig = ctx.createRadialGradient(W()/2, H()/2, H()*0.25, W()/2, H()/2, H()*0.9);
      vig.addColorStop(0, "rgba(0,0,0,0)");
      vig.addColorStop(0.6, "rgba(0,0,0,0.2)");
      vig.addColorStop(1,   "rgba(0,0,0,0.7)");
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, W(), H());

      raf = requestAnimationFrame(draw);
    }

    draw();
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []);

  return <canvas ref={canvasRef} className="fixed inset-0 w-full h-full pointer-events-none" style={{ zIndex: 0 }} />;
}

// ── Floating threat tags that drift across the background ─────────────────────
const TAG_POOL = [
  "CVE-2024-3094", "STEALER LOG", "CREDENTIAL DUMP", "DARK WEB",
  "PASTE SITE", "RANSOMWARE", "INFOSTEALER", "BREACH ALERT",
  "LEAKED HASH", "SESSION TOKEN", "PHISHING KIT", "DATA LEAK",
  "TOR NETWORK", "0DAY EXPLOIT", "BOTNET C2", "COMBO LIST",
];

function FloatingTags() {
  const [tags, setTags] = useState([]);

  useEffect(() => {
    const initial = Array.from({ length: 12 }, (_, i) => ({
      id: i,
      text: TAG_POOL[i % TAG_POOL.length],
      x: Math.random() * 90 + 5,
      y: Math.random() * 90 + 5,
      dx: (Math.random() - 0.5) * 0.012,
      dy: (Math.random() - 0.5) * 0.008,
      opacity: Math.random() * 0.18 + 0.06,
      scale: Math.random() * 0.3 + 0.75,
    }));
    setTags(initial);

    const interval = setInterval(() => {
      setTags((prev) =>
        prev.map((tag) => {
          let nx = tag.x + tag.dx;
          let ny = tag.y + tag.dy;
          let ndx = tag.dx;
          let ndy = tag.dy;
          if (nx < 2 || nx > 92) ndx *= -1;
          if (ny < 2 || ny > 92) ndy *= -1;
          return { ...tag, x: nx, y: ny, dx: ndx, dy: ndy };
        })
      );
    }, 40);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 1 }}>
      {tags.map((tag) => (
        <div
          key={tag.id}
          className="absolute font-mono text-red-500 uppercase tracking-widest whitespace-nowrap transition-none"
          style={{
            left: `${tag.x}%`,
            top:  `${tag.y}%`,
            fontSize: `${9 * tag.scale}px`,
            opacity: tag.opacity,
            letterSpacing: "0.15em",
            transform: `translate(-50%, -50%)`,
          }}
        >
          {tag.text}
        </div>
      ))}
    </div>
  );
}

// ── Left panel brand content ───────────────────────────────────────────────────
const BRAND_PILLARS = [
  {
    icon: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z",
    title: "Real-time Monitoring",
    text: "7 intelligence sources scanned continuously",
  },
  {
    icon: "M13 10V3L4 14h7v7l9-11h-7z",
    title: "Instant Alerts",
    text: "Email & webhook notifications on exposure",
  },
  {
    icon: "M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z",
    title: "Fully Self-Hosted",
    text: "No data leaves your private infrastructure",
  },
];

function BrandPillars({ mounted }) {
  return (
    <div className="mt-10 space-y-4">
      {BRAND_PILLARS.map(({ icon, title, text }, i) => (
        <div
          key={title}
          className="flex items-center gap-4 transition-all duration-700"
          style={{
            opacity: mounted ? 1 : 0,
            transform: mounted ? "translateX(0)" : "translateX(-20px)",
            transitionDelay: `${200 + i * 80}ms`,
          }}
        >
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: "rgba(220,38,38,0.1)", border: "1px solid rgba(220,38,38,0.2)" }}
          >
            <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={icon} />
            </svg>
          </div>
          <div>
            <p className="text-xs font-bold text-gray-300 tracking-wide">{title}</p>
            <p className="text-[11px] text-gray-600 font-mono mt-0.5">{text}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Eye toggle icon ───────────────────────────────────────────────────────────
function EyeIcon({ open }) {
  return open ? (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  ) : (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
    </svg>
  );
}

// ── Input ─────────────────────────────────────────────────────────────────────
function Input({ label, type = "text", value, onChange, placeholder, autoFocus }) {
  const [showPw, setShowPw] = useState(false);
  const isPassword = type === "password";
  const inputType  = isPassword ? (showPw ? "text" : "password") : type;

  return (
    <div>
      <label className="block text-xs uppercase tracking-widest text-gray-500 mb-1.5">{label}</label>
      <div className="relative">
        <input
          type={inputType}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          className={`w-full text-gray-200 text-sm font-mono px-4 py-3 rounded-lg outline-none placeholder-gray-700 transition-all ${isPassword ? "pr-11" : ""}`}
          style={{
            background: "rgba(9,9,11,0.8)",
            border: "1px solid rgba(255,255,255,0.07)",
          }}
          onFocus={(e) => { e.target.style.borderColor = "rgba(220,38,38,0.5)"; e.target.style.boxShadow = "0 0 0 3px rgba(220,38,38,0.08)"; }}
          onBlur={(e)  => { e.target.style.borderColor = "rgba(255,255,255,0.07)"; e.target.style.boxShadow = "none"; }}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShowPw((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-300 transition-colors"
            tabIndex={-1}
          >
            <EyeIcon open={showPw} />
          </button>
        )}
      </div>
    </div>
  );
}

// ── TOTP step ─────────────────────────────────────────────────────────────────
function TOTPStep({ partialToken, userData, onSuccess, onBack }) {
  const [code, setCode]       = useState("");
  const [error, setError]     = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (code.replace(/\s/g, "").length !== 6) { setError("Enter the 6-digit code from your authenticator app."); return; }
    setError(""); setLoading(true);
    try {
      const res = await fetch(`${BASE}/auth/totp/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partial_token: partialToken, code: code.replace(/\s/g, "") }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Invalid code");
      onSuccess(data.access_token, { name: data.user_name, email: data.user_email, role: data.user_role || "analyst" });
    } catch (err) {
      setError(err.message); setCode("");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="flex items-center gap-3 rounded-lg px-4 py-3"
        style={{ background: "rgba(220,38,38,0.06)", border: "1px solid rgba(220,38,38,0.2)" }}>
        <svg className="w-5 h-5 text-red-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
        <div>
          <p className="text-xs font-semibold text-red-400">Two-Factor Authentication</p>
          <p className="text-[11px] text-gray-500 font-mono mt-0.5">Signed in as {userData?.email}</p>
        </div>
      </div>
      <div>
        <label className="block text-xs uppercase tracking-widest text-gray-500 mb-1.5">Authenticator Code</label>
        <input
          type="text" inputMode="numeric" maxLength={6} value={code}
          onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ""))}
          placeholder="000000" autoFocus
          className="w-full text-gray-200 text-2xl font-mono text-center px-4 py-4 rounded-lg outline-none placeholder-gray-700 tracking-[0.5em] transition-all"
          style={{ background: "rgba(9,9,11,0.8)", border: "1px solid rgba(255,255,255,0.07)" }}
        />
      </div>
      {error && (
        <div className="flex items-center gap-2 rounded px-3 py-2"
          style={{ background: "rgba(220,38,38,0.06)", border: "1px solid rgba(220,38,38,0.2)" }}>
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0"></span>
          <p className="text-xs text-red-400 font-mono">{error}</p>
        </div>
      )}
      <button type="submit" disabled={loading || code.length !== 6}
        className="w-full text-sm uppercase tracking-widest font-bold text-white py-3.5 rounded-lg transition-all disabled:opacity-40"
        style={{ background: "linear-gradient(135deg, #dc2626, #b91c1c)", boxShadow: "0 4px 20px rgba(220,38,38,0.35)" }}>
        {loading ? "Verifying…" : "Verify Code"}
      </button>
      <button type="button" onClick={onBack} className="w-full text-xs text-gray-600 hover:text-gray-400 transition-colors">
        ← Back to sign in
      </button>
    </form>
  );
}

// ── Sign In form ──────────────────────────────────────────────────────────────
function SignInForm({ onSwitch, onSuccess, onNeedsTOTP }) {
  const [email, setEmail]     = useState("");
  const [password, setPass]   = useState("");
  const [error, setError]     = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault(); setError(""); setLoading(true);
    try {
      const data = await apiPostForm("/auth/login", { username: email, password });
      if (data.token_type === "totp_pending") {
        onNeedsTOTP(data.access_token, { name: data.user_name, email: data.user_email, role: data.user_role || "analyst" });
        return;
      }
      onSuccess(data.access_token, { name: data.user_name, email: data.user_email, role: data.user_role || "analyst" });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input label="Email" type="email" value={email} onChange={setEmail} placeholder="you@company.com" autoFocus />
      <Input label="Password" type="password" value={password} onChange={setPass} placeholder="••••••••" />
      {error && (
        <div className="flex items-center gap-2 rounded px-3 py-2"
          style={{ background: "rgba(220,38,38,0.06)", border: "1px solid rgba(220,38,38,0.2)" }}>
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0"></span>
          <p className="text-xs text-red-400 font-mono">{error}</p>
        </div>
      )}
      <button type="submit" disabled={loading}
        className="w-full text-sm uppercase tracking-widest font-bold text-white py-3.5 rounded-lg transition-all disabled:opacity-40 mt-2"
        style={{ background: "linear-gradient(135deg, #dc2626, #b91c1c)", boxShadow: "0 4px 24px rgba(220,38,38,0.4)" }}>
        {loading ? "Authenticating…" : "Sign In"}
      </button>
      <p className="text-center text-xs text-gray-600 pt-1">
        No account?{" "}
        <button type="button" onClick={onSwitch} className="text-gray-400 hover:text-white transition-colors underline underline-offset-2">
          Create one
        </button>
      </p>
    </form>
  );
}

// ── Password policy ───────────────────────────────────────────────────────────
const POLICY = [
  { id: "len",     label: "At least 8 characters",         test: (p) => p.length >= 8 },
  { id: "upper",   label: "One uppercase letter (A–Z)",    test: (p) => /[A-Z]/.test(p) },
  { id: "lower",   label: "One lowercase letter (a–z)",    test: (p) => /[a-z]/.test(p) },
  { id: "digit",   label: "One number (0–9)",              test: (p) => /\d/.test(p) },
  { id: "special", label: "One special character (!@#$…)", test: (p) => /[^A-Za-z0-9]/.test(p) },
];

function passwordStrength(pw) {
  const n = POLICY.filter((r) => r.test(pw)).length;
  if (n <= 1) return { label: "Weak",       color: "#7f1d1d", width: "20%",  text: "#ef4444" };
  if (n <= 2) return { label: "Fair",        color: "#ea580c", width: "40%",  text: "#f97316" };
  if (n <= 3) return { label: "Medium",      color: "#ca8a04", width: "60%",  text: "#eab308" };
  if (n <= 4) return { label: "Strong",      color: "#dc2626", width: "80%",  text: "#f87171" };
  return             { label: "Very Strong", color: "#dc2626", width: "100%", text: "#f87171" };
}

function PasswordStrengthMeter({ password }) {
  if (!password) return null;
  const s = passwordStrength(password);
  return (
    <div className="mt-2 space-y-2">
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1 rounded-full" style={{ background: "rgba(255,255,255,0.06)" }}>
          <div className="h-1 rounded-full transition-all duration-500" style={{ width: s.width, background: s.color }} />
        </div>
        <span className="text-[10px] uppercase tracking-widest font-bold shrink-0" style={{ color: s.text }}>{s.label}</span>
      </div>
      <div className="grid grid-cols-1 gap-0.5">
        {POLICY.map((rule) => {
          const ok = rule.test(password);
          return (
            <div key={rule.id} className="flex items-center gap-2">
              <svg className="w-3 h-3 shrink-0" style={{ color: ok ? "#ef4444" : "#374151" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {ok ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}   d="M6 18L18 6M6 6l12 12" />}
              </svg>
              <span className="text-[10px] font-mono" style={{ color: ok ? "rgba(248,113,113,0.75)" : "#374151" }}>{rule.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ConfirmMatch({ password, confirm }) {
  if (!confirm) return null;
  const match = password === confirm;
  return (
    <div className="flex items-center gap-1.5 mt-1.5 text-[10px] font-mono"
      style={{ color: match ? "#ef4444" : "rgba(239,68,68,0.4)" }}>
      <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        {match ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
               : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}   d="M6 18L18 6M6 6l12 12" />}
      </svg>
      {match ? "Passwords match" : "Passwords do not match"}
    </div>
  );
}

// ── Sign Up form ──────────────────────────────────────────────────────────────
function SignUpForm({ onSwitch, onSuccess }) {
  const [name, setName]       = useState("");
  const [email, setEmail]     = useState("");
  const [password, setPass]   = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError]     = useState("");
  const [loading, setLoading] = useState(false);
  const policyPassed = POLICY.every((r) => r.test(password));

  async function handleSubmit(e) {
    e.preventDefault(); setError("");
    if (!policyPassed) { setError("Password does not meet security requirements."); return; }
    if (password !== confirm) { setError("Passwords do not match."); return; }
    setLoading(true);
    try {
      const data = await apiPost("/auth/register", { name, email, password });
      onSuccess(data.access_token, { name: data.user_name, email: data.user_email, role: data.user_role || "analyst" });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input label="Full Name" value={name} onChange={setName} placeholder="Jane Smith" autoFocus />
      <Input label="Email" type="email" value={email} onChange={setEmail} placeholder="you@company.com" />
      <div>
        <Input label="Password" type="password" value={password} onChange={setPass} placeholder="Min. 8 characters" />
        <PasswordStrengthMeter password={password} />
      </div>
      <div>
        <Input label="Confirm Password" type="password" value={confirm} onChange={setConfirm} placeholder="Re-enter password" />
        <ConfirmMatch password={password} confirm={confirm} />
      </div>
      {error && (
        <div className="flex items-center gap-2 rounded px-3 py-2"
          style={{ background: "rgba(220,38,38,0.06)", border: "1px solid rgba(220,38,38,0.2)" }}>
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0"></span>
          <p className="text-xs text-red-400 font-mono">{error}</p>
        </div>
      )}
      <button type="submit" disabled={loading || !policyPassed || password !== confirm}
        className="w-full text-sm uppercase tracking-widest font-bold text-white py-3.5 rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed mt-2"
        style={{ background: "linear-gradient(135deg, #dc2626, #b91c1c)", boxShadow: "0 4px 24px rgba(220,38,38,0.4)" }}>
        {loading ? "Creating account…" : "Create Account"}
      </button>
      <p className="text-center text-xs text-gray-600 pt-1">
        Already have an account?{" "}
        <button type="button" onClick={onSwitch} className="text-gray-400 hover:text-white transition-colors underline underline-offset-2">
          Sign in
        </button>
      </p>
    </form>
  );
}

// ── SSO button ────────────────────────────────────────────────────────────────
function MicrosoftSSOButton({ onSuccess }) {
  const { instance } = useMsal();
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  async function handleClick() {
    setError(""); setLoading(true);
    try {
      const result  = await instance.loginPopup(loginRequest);
      const account = result.account;
      const data    = await apiPost("/auth/sso", {
        provider: "microsoft", id_token: result.idToken,
        name: account.name, email: account.username,
      });
      onSuccess(data.access_token, { name: data.user_name, email: data.user_email, role: data.user_role || "analyst" });
    } catch (err) {
      setError(err.message || "Microsoft sign-in failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button type="button" onClick={handleClick} disabled={loading}
        className="w-full flex items-center justify-center gap-3 text-sm font-mono text-gray-300 hover:text-white py-3 rounded-lg transition-all disabled:opacity-40"
        style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
        <svg className="w-4 h-4" viewBox="0 0 21 21" fill="none">
          <rect x="1" y="1" width="9" height="9" fill="#F25022" />
          <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
          <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
          <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
        </svg>
        {loading ? "Connecting to Microsoft…" : "Microsoft 365 / Azure AD"}
      </button>
      {error && <p className="text-xs text-red-400 font-mono mt-2 text-center">{error}</p>}
    </>
  );
}

// ── Main AuthPage ─────────────────────────────────────────────────────────────
export default function AuthPage() {
  const { login } = useAuth();
  const [mode, setMode]           = useState("signin");
  const [totpToken, setTotpToken] = useState(null);
  const [totpUser, setTotpUser]   = useState(null);
  const [mounted, setMounted]     = useState(false);

  useEffect(() => { const t = setTimeout(() => setMounted(true), 80); return () => clearTimeout(t); }, []);

  const handleSuccess    = (token, userData) => login(token, userData);
  const handleNeedsTOTP  = (pt, ud) => { setTotpToken(pt); setTotpUser(ud); setMode("totp"); };

  return (
    <div className="min-h-screen bg-[#09090b] overflow-hidden relative">

      {/* ── Full-screen animated canvas ── */}
      <BackgroundCanvas />

      {/* ── Floating dim threat tags ── */}
      <FloatingTags />


      {/* ── Main layout ── */}
      <div className="relative flex min-h-screen" style={{ zIndex: 10 }}>

        {/* ── Left panel — branding + live feed ── */}
        <div className="hidden lg:flex lg:w-[440px] xl:w-[500px] flex-col justify-center px-12 py-16 shrink-0">

          {/* Logo */}
          <div
            className="flex items-center gap-4 mb-10 transition-all duration-700"
            style={{ opacity: mounted ? 1 : 0, transform: mounted ? "translateY(0)" : "translateY(-16px)" }}
          >
            <div className="w-12 h-12 rounded-xl flex items-center justify-center"
              style={{ background: "rgba(220,38,38,0.12)", border: "1px solid rgba(220,38,38,0.3)", boxShadow: "0 0 30px rgba(220,38,38,0.15)" }}>
              <img src="/logo-128.png" alt="Breach Tower" className="w-8 h-8 object-contain" />
            </div>
            <div>
              <p className="text-lg font-black tracking-widest uppercase text-white">Breach Tower</p>
              <p className="text-[10px] tracking-widest uppercase font-mono" style={{ color: "rgba(220,38,38,0.6)" }}>Threat Intelligence</p>
            </div>
          </div>

          {/* Headline */}
          <div
            className="mb-10 transition-all duration-700 delay-75"
            style={{ opacity: mounted ? 1 : 0, transform: mounted ? "translateY(0)" : "translateY(12px)" }}
          >
            <h2 className="text-4xl font-black leading-none mb-4 tracking-tight">
              <span style={{ color: "#ef4444" }}>Dark Web</span><br />
              <span className="text-white">Intelligence</span><br />
              <span className="font-light text-gray-400">for the Enterprise</span>
            </h2>
            <p className="text-xs text-gray-500 leading-relaxed font-mono max-w-xs">
              Monitor breach databases, paste sites, and Telegram stealer log channels for exposed credentials — before attackers exploit them.
            </p>
          </div>

          {/* Brand pillars */}
          <BrandPillars mounted={mounted} />
        </div>

        {/* ── Vertical divider ── */}
        <div className="hidden lg:block w-px my-16 shrink-0"
          style={{ background: "linear-gradient(to bottom, transparent, rgba(220,38,38,0.25), transparent)" }} />

        {/* ── Right panel — auth card ── */}
        <div className="flex-1 flex items-center justify-center p-6 lg:p-12">
          <div
            className="w-full max-w-md transition-all duration-700 delay-100"
            style={{ opacity: mounted ? 1 : 0, transform: mounted ? "translateY(0) scale(1)" : "translateY(24px) scale(0.97)" }}
          >

            {/* Mobile logo */}
            <div className="lg:hidden flex items-center gap-3 mb-8 justify-center">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ background: "rgba(220,38,38,0.12)", border: "1px solid rgba(220,38,38,0.3)" }}>
                <img src="/logo-128.png" alt="Breach Tower" className="w-7 h-7 object-contain" />
              </div>
              <div>
                <p className="text-base font-black text-white tracking-widest uppercase">Breach Tower</p>
                <p className="text-[10px] tracking-widest uppercase font-mono" style={{ color: "rgba(220,38,38,0.6)" }}>Threat Intelligence</p>
              </div>
            </div>

            {/* Auth card */}
            <div
              className="rounded-2xl p-8 relative overflow-hidden"
              style={{
                background: "rgba(17,17,19,0.85)",
                backdropFilter: "blur(20px)",
                border: "1px solid rgba(255,255,255,0.07)",
                boxShadow: "0 0 0 1px rgba(220,38,38,0.08), 0 30px 60px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.04)",
              }}
            >
              {/* Top red glow line */}
              <div className="absolute top-0 left-0 right-0 h-px"
                style={{ background: "linear-gradient(90deg, transparent 0%, rgba(220,38,38,0.7) 50%, transparent 100%)" }} />

              {/* Subtle inner glow */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-24 pointer-events-none"
                style={{ background: "radial-gradient(ellipse, rgba(220,38,38,0.07) 0%, transparent 70%)" }} />

              <div className="relative">
                {mode === "totp" ? (
                  <>
                    <div className="flex items-center gap-3 mb-7">
                      <div className="w-9 h-9 rounded-lg flex items-center justify-center"
                        style={{ background: "rgba(220,38,38,0.12)", border: "1px solid rgba(220,38,38,0.25)" }}>
                        <img src="/logo-128.png" alt="Breach Tower" className="w-6 h-6 object-contain" />
                      </div>
                      <div>
                        <h1 className="text-lg font-black text-white tracking-wide uppercase">Verify Identity</h1>
                        <p className="text-[11px] text-gray-500">Two-factor authentication required</p>
                      </div>
                    </div>
                    <TOTPStep partialToken={totpToken} userData={totpUser} onSuccess={handleSuccess} onBack={() => setMode("signin")} />
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-3 mb-7">
                      <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                        style={{ background: "rgba(220,38,38,0.12)", border: "1px solid rgba(220,38,38,0.25)" }}>
                        <img src="/logo-128.png" alt="Breach Tower" className="w-6 h-6 object-contain" />
                      </div>
                      <div>
                        <h1 className="text-lg font-black text-white tracking-wide uppercase">
                          {mode === "signin" ? "Sign In" : "Create Account"}
                        </h1>
                        <p className="text-[11px] text-gray-500">
                          {mode === "signin" ? "Access your threat intelligence dashboard" : "Register to start monitoring your organization"}
                        </p>
                      </div>
                    </div>

                    {mode === "signin"
                      ? <SignInForm onSwitch={() => setMode("signup")} onSuccess={handleSuccess} onNeedsTOTP={handleNeedsTOTP} />
                      : <SignUpForm onSwitch={() => setMode("signin")} onSuccess={handleSuccess} />
                    }

                    {SSO_ENABLED && mode === "signin" && (
                      <>
                        <div className="flex items-center gap-3 my-5">
                          <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.06)" }}></div>
                          <span className="text-[10px] uppercase tracking-widest text-gray-700">or continue with</span>
                          <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.06)" }}></div>
                        </div>
                        <MicrosoftSSOButton onSuccess={handleSuccess} />
                      </>
                    )}
                  </>
                )}
              </div>
            </div>

            <p className="text-center text-[10px] text-gray-700 font-mono mt-5">
              © 2026 Breach Tower — Enterprise Threat Intelligence
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
