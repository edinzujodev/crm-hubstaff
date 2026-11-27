import { dmy } from "@/lib/days";

export function fmtDuration(seconds: number): string {
  const m = Math.round(seconds / 60);
  const h = Math.floor(m / 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${String(m % 60).padStart(2, "0")}m`;
}

/** How long something has lasted: "5m", "2h 05m", "3d 4h". */
export function fmtSpan(ms: number): string {
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${String(m % 60).padStart(2, "0")}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

/** How long ago something started, as a span: "2h 05m". */
export function spanSince(from: Date): string {
  return fmtSpan(Date.now() - from.getTime());
}

/** "27/11/2026 14:05" in the given time zone. */
export function fmtDateTime(d: Date, timeZone: string): string {
  return `${dmy(localDay(d, timeZone))} ${fmtTime(d, timeZone)}`;
}

export function fmtTime(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit" }).format(d);
}

/** Calendar day (`YYYY-MM-DD`) of an instant in the given time zone. */
export function localDay(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** Shortens long text to `max` characters, ending with an ellipsis. */
export function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1).trimEnd() + "…" : text;
}

/** `2026-11-13` -> `13/11/2026`. */
export function fmtDay(day: string): string {
  return dmy(day);
}
