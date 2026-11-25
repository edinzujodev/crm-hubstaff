import { fmtDays, fmtLongDay } from "@/lib/days";
import { KIND_LABEL, type TimeOffKind } from "@/lib/leave-days";
import type { Balance } from "@/lib/time-off";

export const fmtNum = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** A number inside a ring; the ring fills by `share` (0–1), or stays an empty track without one. */
function Ring({ value, share, tone }: { value: number; share?: number; tone: string }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const fill = share === undefined ? 0 : Math.min(1, Math.max(0, share));
  return (
    <span className={`relative inline-flex h-16 w-16 shrink-0 items-center justify-center ${tone}`}>
      <svg viewBox="0 0 60 60" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx="30" cy="30" r={r} fill="none" stroke="currentColor" strokeOpacity={0.15} strokeWidth="2.5" />
        {fill > 0 && (
          <circle
            cx="30"
            cy="30"
            r={r}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray={`${c * fill} ${c}`}
          />
        )}
      </svg>
      <span className="font-mono text-lg font-semibold tabular-nums">{fmtNum(value)}</span>
    </span>
  );
}

function Tile({ ring, title, children }: { ring: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="card flex items-center gap-4 p-4 sm:flex-col sm:items-start sm:p-5">
      {ring}
      <div className="min-w-0">
        <h3 className="font-semibold">{title}</h3>
        <div className="space-y-0.5 text-xs text-muted">{children}</div>
      </div>
    </div>
  );
}

const OTHER_KINDS = ["personal", "religious", "unpaid"] as const satisfies TimeOffKind[];

/**
 * This year at a glance: vacation days left out of the year's total, sick days taken (no limit), and the other
 * kinds of leave taken. `taken` holds the approved days of each kind this year.
 */
export function LeaveTiles({ b, taken, today }: { b: Balance; taken: Record<TimeOffKind, number>; today: string }) {
  const total = b.allowance + b.carriedOver - b.expired;
  const carryHint = b.carriedOver
    ? b.expired
      ? `${fmtDays(b.expired)} from ${b.year - 1} expired`
      : today <= b.carryOverUntil
        ? `${fmtDays(b.carriedOver)} from ${b.year - 1}, use by ${fmtLongDay(b.carryOverUntil)}`
        : undefined
    : undefined;
  const other = OTHER_KINDS.reduce((n, k) => n + taken[k], 0);
  const otherParts = OTHER_KINDS.filter((k) => taken[k]).map((k) => `${fmtNum(taken[k])} ${KIND_LABEL[k].toLowerCase()}`);

  return (
    <div className="grid gap-3 sm:grid-cols-3 sm:gap-4">
      <Tile title="Vacation" ring={<Ring value={b.left} share={total ? b.left / total : 0} tone="text-sky-500" />}>
        <p>
          {fmtNum(b.left)}/{fmtNum(total)} days available in {b.year}
        </p>
        {b.pending > 0 && <p className="text-amber-600 dark:text-amber-400">{fmtDays(b.pending)} waiting for approval</p>}
        {carryHint && <p>{carryHint}</p>}
      </Tile>
      <Tile title="Sick leave" ring={<Ring value={taken.sick} tone="text-rose-500" />}>
        <p>{taken.sick ? `${fmtDays(taken.sick)} taken in ${b.year}` : `None taken in ${b.year}`}</p>
        <p>No limit, no approval needed</p>
      </Tile>
      <Tile title="Other leave" ring={<Ring value={other} tone="text-violet-500" />}>
        <p>{other ? `${fmtDays(other)} taken in ${b.year}` : `None taken in ${b.year}`}</p>
        <p>{otherParts.length ? otherParts.join(" · ") : "Personal days, religious holidays, unpaid"}</p>
      </Tile>
    </div>
  );
}
