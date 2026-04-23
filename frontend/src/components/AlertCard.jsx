import { useState } from "react";
import { SeverityBadge } from "./SeverityBadge";
import { api } from "../api";
import { fmtDateTime } from "../utils/dates";

function IconShield()    { return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>; }
function IconDatabase()  { return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" /></svg>; }
function IconClipboard() { return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>; }
function IconRadio()     { return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.14 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" /></svg>; }
function IconSearch()    { return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>; }
function IconWarning()   { return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>; }
function IconUser()      { return <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>; }
function IconNote()      { return <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>; }

const SOURCE_ICONS = {
  hibp:       { icon: <IconShield />,    label: "HIBP",        color: "text-zinc-400"   },
  breach:     { icon: <IconDatabase />,  label: "BreachDir",   color: "text-purple-400" },
  paste:      { icon: <IconClipboard />, label: "Paste",       color: "text-zinc-400"   },
  telegram:   { icon: <IconRadio />,     label: "Telegram",    color: "text-sky-400"    },
  leaklookup: { icon: <IconSearch />,    label: "Leak-Lookup", color: "text-orange-400" },
  leakcheck:  { icon: <IconShield />,    label: "LeakCheck",   color: "text-amber-400"  },
  intelx:     { icon: <IconSearch />,    label: "IntelX",      color: "text-blue-400"   },
};

export function AlertCard({ alert, users = [], onAcknowledged, onUpdated }) {
  const [expanded, setExpanded]     = useState(false);
  const [loading, setLoading]       = useState(false);
  const [noteMode, setNoteMode]     = useState(false);
  const [noteText, setNoteText]     = useState(alert.remediation_note || "");
  const [savingNote, setSavingNote] = useState(false);
  const [assignBusy, setAssignBusy] = useState(false);

  async function handleAck() {
    setLoading(true);
    try {
      await api.acknowledgeAlert(alert.id);
      onAcknowledged(alert.id);
    } finally {
      setLoading(false);
    }
  }

  async function handleAssign(e) {
    const val = e.target.value;
    setAssignBusy(true);
    try {
      const res = await api.assignAlert(alert.id, val === "" ? null : parseInt(val));
      onUpdated?.({ ...alert, assigned_to_id: res.assigned_to_id, assigned_to_name: res.assigned_to_name, assigned_at: res.assigned_at });
    } finally {
      setAssignBusy(false);
    }
  }

  async function handleSaveNote() {
    setSavingNote(true);
    try {
      if (noteText.trim() === "") {
        await api.clearAlertNote(alert.id);
        onUpdated?.({ ...alert, remediation_note: null, note_updated_at: null, note_updated_by: null });
      } else {
        const res = await api.setAlertNote(alert.id, noteText.trim());
        onUpdated?.({ ...alert, remediation_note: res.remediation_note, note_updated_at: res.note_updated_at, note_updated_by: res.note_updated_by });
      }
      setNoteMode(false);
    } finally {
      setSavingNote(false);
    }
  }

  const src  = SOURCE_ICONS[alert.source] ?? { icon: <IconWarning />, label: alert.source.toUpperCase(), color: "text-zinc-400" };
  const date = fmtDateTime(alert.created_at);
  const hasNote = !!alert.remediation_note;
  const isAssigned = !!alert.assigned_to_id;

  return (
    <div className={`bg-[#111113] border rounded-xl transition-all ${
      alert.acknowledged
        ? "border-[#1c1c1f] opacity-40"
        : alert.severity === "CRITICAL"
          ? "border-red-500/20"
          : "border-[#1c1c1f] hover:border-[#27272a]"
    }`}>
      <div className="flex items-start gap-4 px-4 py-3.5">

        {/* Source */}
        <div className="flex flex-col items-center gap-1 pt-0.5 shrink-0 w-11">
          <span className={src.color}>{src.icon}</span>
          <span className="text-[10px] text-zinc-600 font-mono uppercase tracking-wider leading-none">{src.label}</span>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <SeverityBadge severity={alert.severity} />
            <span className="text-xs text-zinc-500 font-mono">{date}</span>
            {isAssigned && (
              <span className="inline-flex items-center gap-1 text-[11px] text-sky-400 bg-sky-500/10 border border-sky-500/20 px-1.5 py-0.5 rounded-md font-medium">
                <IconUser /> {alert.assigned_to_name ?? `User #${alert.assigned_to_id}`}
              </span>
            )}
            {hasNote && (
              <span className="inline-flex items-center gap-1 text-[11px] text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded-md font-medium">
                <IconNote /> Note
              </span>
            )}
          </div>
          <p className="mt-1.5 text-sm text-zinc-300 leading-snug font-mono">{alert.data_found}</p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0 pt-0.5">
          <button
            onClick={() => setExpanded((e) => !e)}
            className="text-xs text-zinc-500 hover:text-zinc-200 font-medium transition-colors px-2.5 py-1.5 rounded-lg hover:bg-white/5"
          >
            {expanded ? "Hide" : "Details"}
          </button>
          {!alert.acknowledged && (
            <button
              onClick={handleAck}
              disabled={loading}
              className="text-xs font-medium text-zinc-400 hover:text-white bg-white/5 hover:bg-white/10 px-2.5 py-1.5 rounded-lg transition-all disabled:opacity-40"
            >
              {loading ? "…" : "Dismiss"}
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="mx-4 mb-3.5 space-y-2">
          {alert.remediation_steps && (
            <div className="px-4 py-3 bg-[#09090b] border border-[#1c1c1f] rounded-lg text-sm text-zinc-400 font-mono leading-relaxed">
              <p className="text-xs text-zinc-600 font-sans font-semibold uppercase tracking-wider mb-2">Recommended Actions</p>
              {alert.remediation_steps}
            </div>
          )}

          {/* Assignment + Note controls */}
          <div className="px-4 py-3 bg-[#09090b] border border-[#1c1c1f] rounded-lg space-y-3">

            {/* Assign */}
            {users.length > 0 && (
              <div className="flex items-center gap-3">
                <span className="text-xs text-zinc-500 font-semibold w-20 shrink-0">Assigned to</span>
                <select
                  value={alert.assigned_to_id ?? ""}
                  onChange={handleAssign}
                  disabled={assignBusy}
                  className="flex-1 text-xs bg-[#111113] border border-[#2a2a2e] rounded-lg px-2.5 py-1.5 text-zinc-300 disabled:opacity-50"
                >
                  <option value="">— Unassigned —</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                  ))}
                </select>
              </div>
            )}

            {/* Remediation note */}
            <div className="flex items-start gap-3">
              <span className="text-xs text-zinc-500 font-semibold w-20 shrink-0 pt-1.5">Note</span>
              {noteMode ? (
                <div className="flex-1 space-y-1.5">
                  <textarea
                    rows={3}
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    placeholder="Add remediation note…"
                    className="w-full text-xs bg-[#111113] border border-[#2a2a2e] rounded-lg px-3 py-2 text-zinc-300 resize-none focus:outline-none focus:border-zinc-600"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleSaveNote}
                      disabled={savingNote}
                      className="text-xs font-semibold bg-red-600 hover:bg-red-500 text-white rounded-lg px-3 py-1.5 disabled:opacity-50"
                    >
                      {savingNote ? "Saving…" : "Save"}
                    </button>
                    <button
                      onClick={() => { setNoteMode(false); setNoteText(alert.remediation_note || ""); }}
                      className="text-xs font-medium bg-[#1c1c1f] hover:bg-[#27272a] text-zinc-400 rounded-lg px-3 py-1.5"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex items-start gap-2">
                  {hasNote ? (
                    <p className="flex-1 text-xs text-zinc-300 font-mono leading-relaxed whitespace-pre-wrap">{alert.remediation_note}</p>
                  ) : (
                    <p className="flex-1 text-xs text-zinc-600 italic">No note</p>
                  )}
                  <button
                    onClick={() => setNoteMode(true)}
                    className="text-xs font-medium text-zinc-500 hover:text-zinc-200 hover:bg-white/5 px-2 py-1 rounded-lg shrink-0"
                  >
                    {hasNote ? "Edit" : "Add"}
                  </button>
                </div>
              )}
            </div>

            {alert.note_updated_by && (
              <p className="text-[10px] text-zinc-700 font-mono">
                Last edited by {alert.note_updated_by} · {fmtDateTime(alert.note_updated_at)}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
