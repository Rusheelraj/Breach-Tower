// All timestamps from the backend are naive UTC (no "Z" suffix).
// Appending "Z" forces the browser to treat them as UTC before converting to local.
function toUTC(iso) {
  if (!iso) return null;
  const s = String(iso);
  return s.endsWith("Z") || s.includes("+") || s.includes("-", 10) ? s : s + "Z";
}

export function fmtDateTime(iso) {
  if (!iso) return "—";
  return new Date(toUTC(iso)).toLocaleString(undefined, {
    month: "short", day: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(toUTC(iso)).toLocaleDateString(undefined, {
    month: "short", day: "numeric", year: "numeric",
  });
}

export function fmtShort(iso) {
  if (!iso) return "—";
  return new Date(toUTC(iso)).toLocaleString(undefined, {
    month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}
