"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { Modal } from "@/components/modal";
import { EventForm, type EventData, type EventTeamOption } from "@/components/event-form";
import { HolidayForm, UnblockButton, type HolidayEdit } from "@/components/holiday-actions";
import { addDays, fmtRange, fmtShortDay, isWeekend, weekday } from "@/lib/days";
import { ORDER, TYPE_ICON, TYPE_TONE } from "@/lib/calendar-tones";

export type CalendarItem = {
  key: string;
  type: "holiday" | "religious" | "blocked" | "birthday" | "anniversary" | "event" | "time-off";
  start: string;
  end: string;
  title: string;
  /** Lines shown when the item is opened. */
  details?: string[];
  /** A repeating event: gets a small repeat mark. */
  repeats?: boolean;
  /** Pending time off: shown faded. */
  tentative?: boolean;
  /** Extra classes for the chip (time-off kinds have their own colours). */
  tone?: string;
  /** Set when the signed-in person may edit this event. */
  event?: EventData;
  /** Set when the signed-in person may edit this holiday (super admins). */
  holiday?: HolidayEdit;
  /** Set on blocked days when the signed-in person may unblock them (super admins). */
  blockId?: number;
};

/** Working days only: the calendars leave out Saturdays and Sundays. */
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const MAX_IN_CELL = 2;

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
      {item.repeats && <i className="pi pi-replay ml-auto shrink-0 text-[8px] opacity-70" aria-label="Repeats" />}
    </button>
  );
}

/**
 * The HR month calendar: holidays, events, birthdays and work anniversaries (who is away is on Time off). On phones the month turns
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
  // Everything on a day with more than fits in its cell.
  const [more, setMore] = useState<{ day: string; items: CalendarItem[] } | null>(null);
  const close = useCallback(() => {
    setOpen(null);
    setAdding(null);
    setMore(null);
  }, []);
  const openItem = useCallback((i: CalendarItem) => {
    setMore(null);
    setOpen(i);
  }, []);
  const canAdd = eventTeams.length > 0;

  // The grid runs Monday to Friday (weekends left out), from the week of the 1st to the week of the last day.
  const gridStart = addDays(first, -((weekday(first) + 6) % 7));
  const gridEnd = addDays(last, (7 - weekday(last)) % 7);
  const days: string[] = [];
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) if (!isWeekend(d)) days.push(d);
  const on = (day: string) =>
    items
      .filter((i) => i.start <= day && i.end >= day)
      .sort((a, b) => ORDER.indexOf(a.type) - ORDER.indexOf(b.type) || a.title.localeCompare(b.title));
  const inMonth = (d: string) => d.slice(0, 7) === month;

  return (
    <>
      {/* Month grid (tablets and up) */}
      <div className="hidden md:block">
        <div className="grid grid-cols-5 border-b border-border text-xs font-medium text-muted">
          {WEEKDAYS.map((w) => (
            <div key={w} className="px-2 py-1.5">
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-5">
          {days.map((d) => {
            const list = on(d);
            const isToday = d === today;
            return (
              <div
                key={d}
                className={`group min-h-[4.75rem] border-b border-r border-border p-1 [&:nth-child(5n)]:border-r-0 ${inMonth(d) ? "" : "opacity-45"}`}
              >
                <div className="mb-0.5 flex items-center justify-between">
                  <span
                    className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs tabular-nums ${
                      isToday ? "bg-primary font-semibold text-(--primary-fg)" : "text-muted"
                    }`}
                  >
                    {Number(d.slice(8))}
                  </span>
                  {canAdd && (
                    <button
                      type="button"
                      onClick={() => setAdding(d)}
                      className="-my-0.5 flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-border bg-surface text-muted opacity-0 shadow-sm hover:border-primary hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
                      aria-label={`Add an event on ${fmtShortDay(d)}`}
                    >
                      <i className="pi pi-plus text-sm" aria-hidden />
                    </button>
                  )}
                </div>
                <div className="space-y-0.5">
                  {list.slice(0, MAX_IN_CELL).map((i) => (
                    <Chip key={i.key} item={i} onOpen={openItem} />
                  ))}
                  {list.length > MAX_IN_CELL && (
                    <button
                      type="button"
                      onClick={() =>
                        setMore({ day: d, items: list })
                      }
                      className="cursor-pointer px-1.5 text-[11px] leading-4 font-medium text-muted hover:text-foreground"
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
                  <Chip key={i.key} item={i} onOpen={openItem} />
                ))}
              </span>
            </li>
          ))}
        {!days.some((d) => inMonth(d) && on(d).length) && <li className="px-4 py-6 text-sm text-muted">Nothing this month.</li>}
      </ol>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border px-4 py-3 text-xs text-muted">{legend}</div>

      {more && (
        <Modal title={fmtShortDay(more.day)} onClose={close}>
          <div className="space-y-1">
            {more.items.map((i) => (
              <Chip key={i.key} item={i} onOpen={openItem} />
            ))}
          </div>
        </Modal>
      )}
      {open && !open.event && !open.holiday && (
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
              <Link href="/profile/time-off" className="underline">
                Time off on your profile
              </Link>
              .
            </p>
          )}
          {open.blockId !== undefined && (
            <div className="flex justify-end border-t border-border pt-3">
              <UnblockButton id={open.blockId} what={fmtRange(open.start, open.end)} onDone={close} />
            </div>
          )}
        </Modal>
      )}
      {open?.holiday && (
        <Modal title="Edit holiday" onClose={close}>
          <HolidayForm holiday={open.holiday} onDone={close} />
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
