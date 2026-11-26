"use client";

import { useState } from "react";
import { addDays, eachDay, fmtMonth, fmtShortDay, isWeekend, monthBounds, shiftMonth, weekday } from "@/lib/days";
import type { BlockedSpan, TeamOff } from "@/lib/leave-days";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];

/**
 * The worker's team in the request form: a small month of working days, each with how many others are off (or have
 * asked to be); hover a day for their names. Days the team is already full on are red, and days blocked for time off
 * are grey with a ⊘; neither can be picked. Clicking a day picks the first day; clicking a later one picks the last.
 */
export function TeamOffCalendar({
  team,
  offByDay,
  daysOff,
  blocked,
  canPickBlocked = false,
  today,
  start,
  end,
  onPick,
}: {
  team: TeamOff;
  offByDay: Map<string, string[]>;
  daysOff: Set<string>;
  /** Days nobody can take off (for this kind of time off), with why. */
  blocked: BlockedSpan[];
  /** A super admin can still pick blocked days. */
  canPickBlocked?: boolean;
  today: string;
  start: string;
  end: string;
  onPick: (day: string) => void;
}) {
  const [month, setMonth] = useState((start || today).slice(0, 7));
  const { first, last } = monthBounds(month);
  // Whole weeks, Monday to Friday, so the grid lines up.
  const from = addDays(first, -((weekday(first) + 6) % 7));
  const days = eachDay(from, last).filter((d) => !isWeekend(d));
  const full = (d: string) => team.max !== null && (offByDay.get(d)?.length ?? 0) >= team.max;
  const picked = (d: string) => !!start && d >= start && d <= (end || start);
  const step = "flex h-6 w-6 cursor-pointer items-center justify-center rounded-md hover:bg-foreground/5 disabled:cursor-default disabled:opacity-40";

  return (
    <section className="space-y-1.5 rounded-lg border border-border p-2.5" aria-label={`Who in ${team.name} is off`}>
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-xs font-medium text-muted">
          {team.name}
          {team.max !== null && (
            <span className="font-normal">
              {" "}
              · {team.max} of {team.size} can be off at once
            </span>
          )}
        </p>
        <div className="flex shrink-0 items-center">
          <button type="button" className={step} disabled={month <= today.slice(0, 7)} onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month">
            <i className="pi pi-chevron-left text-[10px]" aria-hidden />
          </button>
          <span className="w-28 text-center text-xs font-medium">{fmtMonth(month)}</span>
          <button type="button" className={step} onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Next month">
            <i className="pi pi-chevron-right text-[10px]" aria-hidden />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-0.5 text-[11px]">
        {WEEKDAYS.map((d) => (
          <span key={d} className="text-center text-[10px] text-muted">
            {d}
          </span>
        ))}
        {days.map((d) => {
          const names = offByDay.get(d) ?? [];
          const other = d.slice(0, 7) !== month;
          const holiday = daysOff.has(d);
          const past = d < today;
          const isFull = full(d);
          const block = blocked.find((b) => b.startDate <= d && b.endDate >= d);
          const disabled = past || holiday || isFull || other || (!!block && !canPickBlocked);
          const title = holiday
            ? `${fmtShortDay(d)} · public holiday`
            : block
              ? `${fmtShortDay(d)} · blocked: ${block.reason}`
            : names.length
              ? `${fmtShortDay(d)} · off: ${names.join(", ")}${isFull ? " · team is full" : ""}`
              : `${fmtShortDay(d)} · nobody off`;
          return (
            <button
              key={d}
              type="button"
              title={title}
              disabled={disabled}
              onClick={() => onPick(d)}
              className={`relative flex h-7 items-center justify-center rounded border transition-colors ${other ? "invisible" : ""} ${
                block
                  ? `bg-zinc-500/15 text-muted ${picked(d) ? "border-primary" : "border-zinc-300 dark:border-zinc-700"}`
                  : isFull
                  ? `bg-red-500/10 ${picked(d) ? "border-red-500" : "border-red-300 dark:border-red-800"}`
                  : picked(d)
                    ? "border-primary bg-primary/10"
                    : holiday
                      ? "border-transparent bg-foreground/[0.04]"
                      : "border-border"
              } ${disabled ? "cursor-default" : "cursor-pointer hover:border-primary"} ${past ? "opacity-40" : ""}`}
            >
              <span className={`tabular-nums ${d === today ? "font-bold text-primary" : "font-medium"} ${isFull ? "text-red-700 dark:text-red-300" : ""}`}>
                {Number(d.slice(8))}
                {holiday && <span className="text-muted">★</span>}
              </span>
              {block && <i className="pi pi-ban absolute left-0.5 top-0.5 text-[8px] text-muted" aria-hidden />}
              {/* How many others are off: a small count in the corner. */}
              {names.length > 0 && (
                <span
                  aria-hidden
                  className={`absolute right-0.5 top-0.5 flex h-3 min-w-3 items-center justify-center rounded-full px-0.5 text-[9px] font-semibold leading-none ${
                    isFull ? "bg-red-500 text-white" : "bg-foreground/15 text-foreground/70"
                  }`}
                >
                  {names.length}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm border border-red-300 bg-red-500/10" aria-hidden /> Team full
        </span>
        {blocked.length > 0 && (
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm border border-zinc-300 bg-zinc-500/15" aria-hidden /> Blocked
          </span>
        )}
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm border border-primary bg-primary/10" aria-hidden /> Your dates
        </span>
        <span className="flex items-center gap-1.5">
          <span className="flex h-3 min-w-3 items-center justify-center rounded-full bg-foreground/15 px-0.5 text-[9px] font-semibold text-foreground/70" aria-hidden>
            1
          </span>
          People off (hover for names)
        </span>
      </p>
    </section>
  );
}
