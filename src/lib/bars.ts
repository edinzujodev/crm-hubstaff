import type { BarDatum } from "@/components/charts/bar-list";
import { fmtDuration } from "@/lib/format";
import type { Row } from "@/lib/time-report";

export const pct = (tracked: number, active: number) => (tracked ? `${Math.round((active / tracked) * 100)}%` : "—");

const MAX_BARS = 8;

/** Ranked bars: the top rows, then everything else folded into one "Other" row. */
export function toBars(rows: Row[], total: number, max = MAX_BARS): BarDatum[] {
  const share = (n: number) => (total ? `${Math.round((n / total) * 100)}%` : "");
  const tip = (label: string, r: { tracked: number; billable: number; active: number }) =>
    `${fmtDuration(r.tracked)}
${label}
Billable ${fmtDuration(r.billable)} · Activity ${pct(r.tracked, r.active)}`;
  const shown = rows.slice(0, max).map((r) => ({
    key: r.key,
    label: r.label,
    href: r.href,
    value: r.tracked,
    display: fmtDuration(r.tracked),
    share: share(r.tracked),
    tip: tip(r.label, r),
  }));
  const rest = rows.slice(max);
  if (rest.length) {
    const sum = { tracked: 0, billable: 0, active: 0 };
    for (const r of rest) {
      sum.tracked += r.tracked;
      sum.billable += r.billable;
      sum.active += r.active;
    }
    const label = `Other (${rest.length})`;
    shown.push({ key: "other", label, href: undefined, value: sum.tracked, display: fmtDuration(sum.tracked), share: share(sum.tracked), tip: tip(label, sum) });
  }
  return shown;
}
