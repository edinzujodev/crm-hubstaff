/** A clean axis: `step` is 1, 2 or 5 times a power of ten, and `top` is the first multiple of it above `max`. */
export function niceScale(max: number, target = 4) {
  if (!(max > 0)) return { step: 1, top: 1 };
  const raw = max / target;
  const exp = 10 ** Math.floor(Math.log10(raw));
  const f = raw / exp;
  const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * exp;
  return { step, top: Math.ceil(max / step - 1e-9) * step };
}

/** Axis label for a value in hours: minutes under one hour, otherwise hours. */
export function hoursTick(h: number, top: number) {
  if (top < 1) return `${Math.round(h * 60)}m`;
  return `${+h.toFixed(1)}h`;
}

/** "3 Nov" from "2026-11-03". */
export function shortDay(day: string) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "numeric", month: "short" }).format(new Date(day));
}

/** "Mon 3 Nov" from "2026-11-03". */
export function longDay(day: string) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" }).format(
    new Date(day),
  );
}
