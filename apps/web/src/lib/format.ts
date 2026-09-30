const dateTime = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' });
const dateTimeLong = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

export const fmtDateTime = (iso: string | Date | null | undefined): string => (iso ? dateTime.format(new Date(iso)) : '—');
export const fmtDateTimeLong = (iso: string | Date): string => dateTimeLong.format(new Date(iso));

export function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  const s = ms / 1000;
  if (s < 60) return `${Number.isInteger(s) ? s : s.toFixed(1)} sec`;
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min` : `${(m / 60).toFixed(1)} hr`;
}

/** value for <input type="datetime-local"> in the user's local timezone */
export function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const pillTime = new Intl.DateTimeFormat(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit', second: '2-digit' });
const pillDate = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
/** "Tue 9:15:12 AM" for the coming week, "Oct 14, 9:15 AM" beyond that. */
export function fmtPill(iso: string): string {
  const d = new Date(iso);
  return Math.abs(d.getTime() - Date.now()) > 6 * 24 * 3600 * 1000 ? pillDate.format(d) : pillTime.format(d);
}
