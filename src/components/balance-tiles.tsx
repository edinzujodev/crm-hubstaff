import { fmtDays, fmtLongDay } from "@/lib/days";
import type { Balance } from "@/lib/time-off";

function Fact({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="font-mono text-xl tabular-nums">{value}</dd>
      {hint && <dd className="text-xs text-muted">{hint}</dd>}
    </div>
  );
}

/** This year's vacation: the days left, big, and next to it where they come from. */
export function BalanceTiles({ b, today }: { b: Balance; today: string }) {
  const carryHint = b.carriedOver
    ? b.expired
      ? `${fmtDays(b.expired)} expired on ${fmtLongDay(b.carryOverUntil)}`
      : today <= b.carryOverUntil
        ? `Use by ${fmtLongDay(b.carryOverUntil)}`
        : undefined
    : undefined;
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <div className="shrink-0 sm:w-40">
        <p className="font-mono text-4xl font-semibold tabular-nums">{fmtNum(b.left)}</p>
        <p className="text-xs text-muted">
          {b.left === 1 ? "day" : "days"} left in {b.year}
        </p>
        {b.pending > 0 && <p className="text-xs text-amber-600 dark:text-amber-400">{fmtDays(b.pending)} waiting for approval</p>}
      </div>
      <dl className="grid flex-1 grid-cols-3 gap-4 border-border sm:border-l sm:pl-6">
        <Fact label="Allowance" value={fmtNum(b.allowance)} />
        <Fact label={`From ${b.year - 1}`} value={fmtNum(b.carriedOver)} hint={carryHint} />
        <Fact label="Taken" value={fmtNum(b.used)} />
      </dl>
    </div>
  );
}

export const fmtNum = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
