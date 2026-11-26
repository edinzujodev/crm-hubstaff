"use client";

import { useState } from "react";
import { addDays, eachDay, fmtMonth, fmtShortDay, isWeekend, monthBounds, shiftMonth, weekday } from "@/lib/days";
import type { TeamOff } from "@/lib/leave-days";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const firstName = (name: string) => name.split(/\s+/)[0] ?? name;

/**
 * The worker's team in the request form: a month of working days, each with who else is off (or has asked to be).
 * Days the team is already full on are red and can't be picked. Clicking a day picks the first day; clicking a later
 * one picks the last.
 */
export function TeamOffCalendar({
  team,
  offByDay,
  daysOff,
  today,
  start,
  end,
  onPick,
}: {
  team: TeamOff;
  offByDay: Map<string, string[]>;
  daysOff: Set<string>;
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
  const step = "flex h-7 w-7 cursor-pointer items-center justify-center rounded-md hover:bg-foreground/5 disabled:cursor-default disabled:opacity-40";

  return (
    <section className="space-y-2 rounded-lg border border-border p-3" aria-label={`Who in ${team.name} is off`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted">
          {team.name}
          {team.max !== null && (
            <span className="font-normal">
              {" "}
              · {team.max} of {team.size} can be off at once
            </span>
          )}
        </p>
        <div className="flex items-center gap-1 text-sm">
          <button type="button" className={step} disabled={month <= today.slice(0, 7)} onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month">
            <i className="pi pi-chevron-left text-xs" aria-hidden />
          </button>
          <span className="w-32 text-center font-medium">{fmtMonth(month)}</span>
          <button type="button" className={step} onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Next month">
            <i className="pi pi-chevron-right text-xs" aria-hidden />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-1 text-[11px]">
        {WEEKDAYS.map((d) => (
          <span key={d} className="text-center text-muted">
            {d}
          </span>
        ))}
        {days.map((d) => {
          const names = offByDay.get(d) ?? [];
          const other = d.slice(0, 7) !== month;
          const holiday = daysOff.has(d);
          const past = d < today;
          const isFull = full(d);
          const disabled = past || holiday || isFull || other;
          const title = holiday
            ? `${fmtShortDay(d)} · public holiday`
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
              className={`flex h-12 flex-col items-start rounded-md border px-1 py-0.5 text-left transition-colors ${
                other ? "invisible" : ""
              } ${
                isFull
                  ? `bg-red-500/10 ${picked(d) ? "border-red-500" : "border-red-300 dark:border-red-800"}`
                  : picked(d)
                    ? "border-primary bg-primary/10"
                    : holiday
                      ? "border-transparent bg-foreground/[0.04]"
                      : "border-border"
              } ${disabled ? "cursor-default" : "cursor-pointer hover:border-primary"} ${past ? "opacity-40" : ""}`}
            >
              <span className={`font-semibold tabular-nums ${d === today ? "text-primary" : ""}`}>
                {Number(d.slice(8))}
                {holiday && <span className="ml-0.5 text-muted">★</span>}
              </span>
              {names.length > 0 && (
                <span className={`w-full truncate leading-tight ${isFull ? "font-medium text-red-700 dark:text-red-300" : "text-muted"}`}>
                  {isFull ? "Full" : names.map(firstName).join(", ")}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm border border-red-300 bg-red-500/10" aria-hidden /> Team full, can&apos;t be picked
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm border border-primary bg-primary/10" aria-hidden /> Your dates
        </span>
        <span>Hover a day to see who is off.</span>
      </p>
    </section>
  );
}
