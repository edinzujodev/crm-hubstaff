import Link from "next/link";
import { MonthPicker } from "@/components/month-picker";
import { shiftMonth } from "@/lib/days";

const href = (base: string, month: string, team: boolean) => `${base}?m=${month}${team ? "&who=team" : ""}`;

/** ‹ November 2026 › with a "Today" link when another month is shown. Clicking the month opens a picker to jump to any. */
export function MonthSwitch({ base, month, current, team }: { base: string; month: string; current: string; team: boolean }) {
  const link = "flex h-8 w-8 items-center justify-center rounded-md hover:bg-foreground/5";
  return (
    <span className="flex items-center gap-1 text-sm">
      <Link href={href(base, shiftMonth(month, -1), team)} className={link} aria-label="Previous month">
        <i className="pi pi-chevron-left text-xs" aria-hidden />
      </Link>
      <MonthPicker base={base} month={month} current={current} team={team} />
      <Link href={href(base, shiftMonth(month, 1), team)} className={link} aria-label="Next month">
        <i className="pi pi-chevron-right text-xs" aria-hidden />
      </Link>
      {month !== current && (
        <Link href={href(base, current, team)} className="ml-1 rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-foreground/5">
          Today
        </Link>
      )}
    </span>
  );
}

/** Everyone / My team. Hidden for people without a team. */
export function WhoSwitch({ base, month, team, hasTeam }: { base: string; month: string; team: boolean; hasTeam: boolean }) {
  if (!hasTeam) return null;
  const tab = (on: boolean) =>
    `rounded-md px-2.5 py-1 text-xs font-medium ${on ? "bg-foreground text-background" : "text-muted hover:text-foreground"}`;
  return (
    <span className="flex items-center gap-0.5 rounded-lg border border-border p-0.5">
      <Link href={href(base, month, false)} className={tab(!team)}>
        Everyone
      </Link>
      <Link href={href(base, month, true)} className={tab(team)}>
        My team
      </Link>
    </span>
  );
}
