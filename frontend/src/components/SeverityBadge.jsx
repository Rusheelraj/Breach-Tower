const STYLES = {
  CRITICAL: "bg-red-500/10 text-red-400",
  HIGH:     "bg-orange-500/10 text-orange-400",
  MEDIUM:   "bg-amber-500/10 text-amber-400",
  LOW:      "bg-blue-500/10 text-blue-400",
};

const DOTS = {
  CRITICAL: "bg-red-400",
  HIGH:     "bg-orange-400",
  MEDIUM:   "bg-amber-400",
  LOW:      "bg-blue-400",
};

export function SeverityBadge({ severity }) {
  const cls = STYLES[severity] ?? "bg-zinc-500/10 text-zinc-400";
  const dot = DOTS[severity] ?? "bg-zinc-400";
  const label = severity.charAt(0) + severity.slice(1).toLowerCase();
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`}></span>
      {label}
    </span>
  );
}
