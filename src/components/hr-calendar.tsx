"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { Modal } from "@/components/modal";
import { EventForm, type EventData, type EventTeamOption } from "@/components/event-form";
import { addDays, fmtRange, fmtShortDay, isWeekend, weekday } from "@/lib/days";

export type CalendarItem = {
  key: string;
  type: "holiday" | "religious" | "birthday" | "anniversary" | "event" | "time-off";
  start: string;
  end: string;
  title: string;
  /** Lines shown when the item is opened. */
  details?: string[];
  /** Pending time off: shown faded. */
  tentative?: boolean;
  /** Extra classes for the chip (time-off kinds have their own colours). */
  tone?: string;
  /** Set when the signed-in person may edit this event. */
  event?: EventData;
};

const TYPE_TONE: Record<CalendarItem["type"], string> = {
  holiday: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300",
  religious: "bg-amber-500/10 text-amber-800 dark:text-amber-300",
  birthday: "bg-pink-500/15 text-pink-800 dark:text-pink-300",
  anniversary: "bg-indigo-500/15 text-indigo-800 dark:text-indigo-300",
  event: "bg-primary text-(--primary-fg)",
  "time-off": "bg-sky-500/15 text-sky-800 dark:text-sky-300",
};
const TYPE_ICON: Record<CalendarItem["type"], string> = {
  holiday: "pi-star",
  religious: "pi-star",
  birthday: "pi-gift",
  anniversary: "pi-trophy",
  event: "pi-calendar",
  "time-off": "pi-sun",
};
const ORDER: CalendarItem["type"][] = ["holiday", "event", "religious", "birthday", "anniversary", "time-off"];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MAX_IN_CELL = 3;

function Chip({ item, onOpen }: { item: CalendarItem; onOpen: (i: CalendarItem) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      title={item.title}
      className={`flex w-full cursor-pointer items-center gap-1 truncate rounded px-1.5 py-0.5 text-left text-[11px] font-medium leading-4 hover:brightness-95 ${
        item.tone ?? TYPE_TONE[item.type]
      } ${item.tentative ? "border border-dashed border-current opacity-60" : ""}`}
    >
      <i className={`pi ${TYPE_ICON[item.type]} shrink-0 text-[9px]`} aria-hidden />
      <span className="truncate">{item.title}</span>
    </button>
  );
}

/**
 * The HR month calendar: holidays, events, birthdays, work anniversaries and who is off. On phones the month turns
 * into a list of the days that have something on them.
 */
export function HrCalendar({
  month,
  first,
  last,
  today,
  items,
  eventTeams,
  legend,
}: {
  /** "yyyy-mm" */
  month: string;
  first: string;
  last: string;
  today: string;
  items: CalendarItem[];
  /** Where the person may add events; empty when they can't add any. */
  eventTeams: EventTeamOption[];
  legend: React.ReactNode;
}) {
  const [open, setOpen] = useState<CalendarItem | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const close = useCallback(() => {
    setOpen(null);
    setAdding(null);
  }, []);
  const canAdd = eventTeams.length > 0;

  // The grid runs Monday to Sunday, from the week of the 1st to the week of the last day.
  const gridStart = addDays(first, -((weekday(first) + 6) % 7));
  const gridEnd = addDays(last, (7 - weekday(last)) % 7);
  const days: string[] = [];
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) days.push(d);
  const on = (day: string) =>
    items
      .filter((i) => i.start <= day && i.end >= day)
      .sort((a, b) => ORDER.indexOf(a.type) - ORDER.indexOf(b.type) || a.title.localeCompare(b.title));
  const inMonth = (d: string) => d.slice(0, 7) === month;

  return (
    <>
      {/* Month grid (tablets and up) */}
      <div className="hidden md:block">
        <div className="grid grid-cols-7 border-b border-border text-xs font-medium text-muted">
          {WEEKDAYS.map((w) => (
            <div key={w} className="px-2 py-2">
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((d) => {
            const list = on(d);
            const isToday = d === today;
            return (
              <div
                key={d}
                className={`group min-h-28 border-b border-r border-border p-1.5 [&:nth-child(7n)]:border-r-0 ${
                  isWeekend(d) ? "bg-foreground/[0.025]" : ""
                } ${inMonth(d) ? "" : "opacity-45"}`}
              >
                <div className="mb-1 flex items-center justify-between">
                  <span
                    className={`flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs tabular-nums ${
                      isToday ? "bg-primary font-semibold text-(--primary-fg)" : "text-muted"
                    }`}
                  >
                    {Number(d.slice(8))}
                  </span>
                  {canAdd && (
                    <button
                      type="button"
                      onClick={() => setAdding(d)}
                      className="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-muted opacity-0 hover:bg-foreground/10 focus-visible:opacity-100 group-hover:opacity-100"
                      aria-label={`Add an event on ${fmtShortDay(d)}`}
                    >
                      <i className="pi pi-plus text-[10px]" aria-hidden />
                    </button>
                  )}
                </div>
                <div className="space-y-0.5">
                  {list.slice(0, MAX_IN_CELL).map((i) => (
                    <Chip key={i.key} item={i} onOpen={setOpen} />
                  ))}
                  {list.length > MAX_IN_CELL && (
                    <button
                      type="button"
                      onClick={() =>
                        setOpen({
                          key: `more-${d}`,
                          type: "event",
                          start: d,
                          end: d,
                          title: fmtShortDay(d),
                          details: list.map((i) => i.title),
                        })
                      }
                      className="cursor-pointer px-1.5 text-[11px] font-medium text-muted hover:text-foreground"
                    >
                      +{list.length - MAX_IN_CELL} more
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Agenda (phones) */}
      <ol className="divide-y divide-border md:hidden">
        {days
          .filter((d) => inMonth(d) && on(d).length)
          .map((d) => (
            <li key={d} className="flex gap-3 px-4 py-3">
              <span className={`w-16 shrink-0 text-xs ${d === today ? "font-semibold text-foreground" : "text-muted"}`}>{fmtShortDay(d)}</span>
              <span className="min-w-0 flex-1 space-y-1">
                {on(d).map((i) => (
                  <Chip key={i.key} item={i} onOpen={setOpen} />
                ))}
              </span>
            </li>
          ))}
        {!days.some((d) => inMonth(d) && on(d).length) && <li className="px-4 py-6 text-sm text-muted">Nothing this month.</li>}
      </ol>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border px-4 py-3 text-xs text-muted">{legend}</div>

      {open && !open.event && (
        <Modal title={open.title} onClose={close}>
          <p className="text-sm text-muted">{fmtRange(open.start, open.end)}</p>
          {open.details?.length ? (
            <ul className="space-y-1 text-sm">
              {open.details.map((line, n) => (
                <li key={n}>{line}</li>
              ))}
            </ul>
          ) : null}
          {open.type === "religious" && (
            <p className="text-xs text-muted">
              Not a day off for everyone. Celebrating it? Book it as a religious holiday under{" "}
              <Link href="/hr/time-off" className="underline">
                Time off
              </Link>
              .
            </p>
          )}
        </Modal>
      )}
      {open?.event && (
        <Modal title="Edit event" onClose={close}>
          <EventForm event={open.event} teams={eventTeams} onDone={close} />
        </Modal>
      )}
      {adding && (
        <Modal title="New event" onClose={close}>
          <EventForm date={adding} teams={eventTeams} onDone={close} />
        </Modal>
      )}
    </>
  );
}

/** "New event" button for the page header. */
export function NewEventButton({ teams }: { teams: EventTeamOption[] }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <button type="button" className="p-button p-component gap-2" onClick={() => setOpen(true)}>
        <i className="pi pi-plus text-sm" aria-hidden /> New event
      </button>
      {open && (
        <Modal title="New event" onClose={close}>
          <EventForm teams={teams} onDone={close} />
        </Modal>
      )}
    </>
  );
}
