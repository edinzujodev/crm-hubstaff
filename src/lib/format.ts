export function fmtDuration(seconds: number): string {
  const m = Math.round(seconds / 60);
  const h = Math.floor(m / 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${String(m % 60).padStart(2, "0")}m`;
}

export function fmtDateTime(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
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
