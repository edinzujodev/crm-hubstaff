import { fmtDays, fmtLongDay } from "@/lib/days";
import type { Balance } from "@/lib/time-off";

function Stat({ label, value, hint, strong }: { label: string; value: string; hint?: string; strong?: boolean }) {
  return (
    <div className="card p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 font-mono tabular-nums ${strong ? "text-3xl font-semibold" : "text-2xl"}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function BalanceTiles({ b, today }: { b: Balance; today: string }) {
  const carryHint = b.carriedOver
    ? b.expired
      ? `${fmtDays(b.expired)} expired on ${fmtLongDay(b.carryOverUntil)}`
      : today <= b.carryOverUntil
        ? `Use by ${fmtLongDay(b.carryOverUntil)}`
        : undefined
    : "Nothing left over from last year";
  return (
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Stat strong label={`Vacation days left in ${b.year}`} value={fmtNum(b.left)} hint={b.pending ? `${fmtDays(b.pending)} waiting for approval` : undefined} />
      <Stat label="Yearly allowance" value={fmtNum(b.allowance)} />
      <Stat label={`Carried over from ${b.year - 1}`} value={fmtNum(b.carriedOver)} hint={carryHint} />
      <Stat label="Taken" value={fmtNum(b.used)} hint="Approved vacation this year" />
    </section>
  );
}

export const fmtNum = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

