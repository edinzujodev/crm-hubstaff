import { fmtDays, fmtLongDay } from "@/lib/days";
import { KIND_LABEL, type TimeOffKind } from "@/lib/leave-days";
import type { Balance } from "@/lib/time-off";

export const fmtNum = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

const dayWord = (n: number) => (n === 1 ? "day" : "days");

const OTHER_KINDS = ["sick", "personal", "religious", "unpaid"] as const satisfies TimeOffKind[];
type OtherKind = (typeof OTHER_KINDS)[number];

/** Short names and the same dots as the kinds of time off elsewhere (the requests list, the grids). */
const OTHER: Record<OtherKind, { label: string; dot: string }> = {
  sick: { label: "Sick", dot: "bg-rose-500" },
  personal: { label: "Personal", dot: "bg-violet-500" },
  religious: { label: "Religious", dot: "bg-amber-500" },
  unpaid: { label: "Unpaid", dot: "bg-zinc-400" },
};

/** One entry of the key under a card's number: a dot, a name, and its days. */
function KeyItem({ dot, label, value, title }: { dot: string; label: string; value: number; title?: string }) {
  return (
    <li className="flex items-center gap-1.5" title={title}>
      <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} aria-hidden />
      {label}
      <span className={`tabular-nums ${value ? "font-medium text-foreground" : ""}`}>{fmtNum(value)}</span>
    </li>
  );
}

/**
 * A summary card. Every card has the same parts in the same sizes: an icon and title (and the year), the big number
 * with what it counts, then the details at the bottom.
 */
function Card({
  icon,
  tone,
  title,
  year,
  value,
  unit,
  children,
}: {
  icon: string;
  tone: string;
  title: string;
  year: number;
  value: number;
  unit: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card flex flex-col gap-4 p-5" aria-label={title}>
      <div className="flex items-center gap-2.5">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tone}`} aria-hidden>
          <i className={`pi ${icon} text-sm`} />
        </span>
        <h3 className="font-semibold">{title}</h3>
        <span className="ml-auto text-xs text-muted">{year}</span>
      </div>
      <p className="flex items-baseline gap-2">
        <span className="text-4xl font-semibold tabular-nums">{fmtNum(value)}</span>
        <span className="text-sm text-muted">{unit}</span>
      </p>
      <div className="mt-auto space-y-2.5 text-xs text-muted">{children}</div>
    </section>
  );
}

/**
 * This year at a glance, in two cards. Vacation: the days left out of the year's total, with a bar of the days taken
 * and waiting for approval (the rest of the bar is what is left). Absences: all other days taken this year, by
 * kind. `taken` holds the approved days of each kind this year.
 */
export function LeaveTiles({ b, taken, today }: { b: Balance; taken: Record<TimeOffKind, number>; today: string }) {
  const total = b.allowance + b.carriedOver - b.expired;
  const left = Math.max(0, b.left);
  const carry = b.carriedOver
    ? b.expired
      ? { text: `${fmtDays(b.expired)} carried over from ${b.year - 1} expired`, warn: false }
      : today <= b.carryOverUntil
        ? { text: `${fmtDays(b.carriedOver)} carried over from ${b.year - 1}: use them by ${fmtLongDay(b.carryOverUntil)}`, warn: true }
        : undefined
    : undefined;
  const bar = [
    { key: "used", value: b.used, className: "bg-sky-500" },
    { key: "pending", value: b.pending, className: "bg-sky-500/40" },
    { key: "rest", value: Math.max(0, left - b.pending), className: "bg-foreground/10" },
  ].filter((p) => p.value > 0);
  const other = OTHER_KINDS.reduce((n, k) => n + taken[k], 0);

  return (
    <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
      <Card
        icon="pi-sun"
        tone="bg-sky-500/15 text-sky-600 dark:text-sky-400"
        title="Vacation"
        year={b.year}
        value={left}
        unit={`${dayWord(left)} left of ${fmtNum(total)}`}
      >
        <div
          className="flex h-2 gap-0.5 overflow-hidden rounded-full bg-foreground/10"
          role="img"
          aria-label={`${fmtDays(b.used)} taken, ${fmtDays(b.pending)} waiting for approval, ${fmtDays(left)} left`}
        >
          {total > 0 &&
            bar.map((p) => <span key={p.key} className={`h-full ${p.className}`} style={{ flexGrow: p.value, flexBasis: 0 }} />)}
        </div>
        <ul className="flex flex-wrap gap-x-4 gap-y-1">
          <KeyItem dot="bg-sky-500" label="Taken" value={b.used} />
          <KeyItem dot="bg-sky-500/40" label="Waiting for approval" value={b.pending} />
        </ul>
        {carry && (
          <p className={`flex items-center gap-1.5 ${carry.warn ? "text-amber-700 dark:text-amber-400" : ""}`}>
            <i className="pi pi-history text-[11px]" aria-hidden />
            {carry.text}
          </p>
        )}
      </Card>

      <Card
        icon="pi-calendar"
        tone="bg-violet-500/15 text-violet-600 dark:text-violet-400"
        title="Absences"
        year={b.year}
        value={other}
        unit={`${dayWord(other)} in ${b.year}`}
      >
        <ul className="flex flex-wrap gap-x-4 gap-y-1">
          {OTHER_KINDS.map((k) => (
            <KeyItem key={k} dot={OTHER[k].dot} label={OTHER[k].label} value={taken[k]} title={KIND_LABEL[k]} />
          ))}
        </ul>
      </Card>
    </div>
  );
}
