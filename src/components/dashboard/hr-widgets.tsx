import Link from "next/link";
import { and, asc, eq, gte, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { Avatar } from "@/components/avatar";
import type { CalendarItem } from "@/components/hr-calendar";
import { DecideButtons, KindBadge, TimeOffButton } from "@/components/time-off";
import { VacationGrid } from "@/components/vacation-grid";
import { canUseHr, type Auth } from "@/lib/auth";
import { ORDER, TYPE_ICON, TYPE_TONE } from "@/lib/calendar-tones";
import { config } from "@/lib/config";
import { parseConfig } from "@/lib/dashboard/config";
import { addDays, eachDay, fmtDays, fmtRange, fmtShortDay, isWeekend, monthBounds, weekday, ymd } from "@/lib/days";
import { localDay } from "@/lib/format";
import { blockedBetween, daysOffBetween, holidaysBetween } from "@/lib/holidays";
import { waitingRequests } from "@/lib/hr";
import { awayBetween, companyCalendar, type AwayEntry } from "@/lib/hr-calendar";
import { balanceFor, countDays, KIND_LABEL, KIND_TONE, TIME_OFF_KINDS, type TimeOffKind } from "@/lib/time-off";

// ---------------------------------------------------------------------------------------------
// Shared pieces. "Short" is a week, "long" a month: in a calendar the current week or month, in a list the
// next 7 or 30 days.
// ---------------------------------------------------------------------------------------------

type Length = "short" | "long";
const today = () => localDay(new Date(), config.timeZone);
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function calendarSpan(length: Length, day: string) {
  if (length === "long") return monthBounds(day.slice(0, 7));
  const first = addDays(day, -((weekday(day) + 6) % 7));
  return { first, last: addDays(first, 6) };
}
const listSpan = (length: Length, day: string) => ({ first: day, last: addDays(day, length === "long" ? 29 : 6) });

const dayLabel = (d: string, now: string) => (d === now ? "Today" : d === addDays(now, 1) ? "Tomorrow" : fmtShortDay(d));
const sortItems = (a: CalendarItem, b: CalendarItem) =>
  ORDER.indexOf(a.type) - ORDER.indexOf(b.type) || a.title.localeCompare(b.title);

/** Solid dot colours, written out whole so Tailwind sees them. Keyed by the first class of the item's tone. */
const DOT: Record<string, string> = {
  "bg-emerald-500/15": "bg-emerald-500",
  "bg-amber-500/10": "bg-amber-500",
  "bg-amber-500/15": "bg-amber-500",
  "bg-red-500/15": "bg-red-500",
  "bg-pink-500/15": "bg-pink-500",
  "bg-indigo-500/15": "bg-indigo-500",
  "bg-primary": "bg-primary",
  "bg-sky-500/15": "bg-sky-500",
  "bg-rose-500/15": "bg-rose-500",
  "bg-violet-500/15": "bg-violet-500",
  "bg-zinc-500/15": "bg-zinc-500",
};
const dotClass = (i: CalendarItem) => DOT[(i.tone ?? TYPE_TONE[i.type]).split(" ")[0]!] ?? "bg-foreground/40";

function Note({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-sm text-muted">{children}</p>;
}

function Footer({ children }: { children: React.ReactNode }) {
  return <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2 text-xs">{children}</div>;
}

function MoreLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="text-muted underline hover:text-foreground">
      {children}
    </Link>
  );
}

function Chip({ item }: { item: CalendarItem }) {
  return (
    <span
      title={[item.title, ...(item.details ?? [])].join("\n")}
      className={`flex min-w-0 items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium leading-4 ${item.tone ?? TYPE_TONE[item.type]} ${
        item.tentative ? "border border-dashed border-current opacity-60" : ""
      }`}
    >
      <i className={`pi ${TYPE_ICON[item.type]} shrink-0 text-[9px]`} aria-hidden />
      <span className="truncate">{item.title}</span>
    </span>
  );
}

/**
 * A calendar of `first`..`last`, Monday to Sunday. A week shows every item in its day; a month shows a dot per
 * item in narrow widgets and short chips in wide ones (container queries, so it follows the widget's width).
 */
function CalendarView({ first, last, now, items, month }: { first: string; last: string; now: string; items: CalendarItem[]; month?: string }) {
  const gridStart = addDays(first, -((weekday(first) + 6) % 7));
  const gridEnd = addDays(last, (7 - weekday(last)) % 7);
  const days = eachDay(gridStart, gridEnd);
  const on = (d: string) => items.filter((i) => i.start <= d && i.end >= d).sort(sortItems);
  const week = !month;
  return (
    <div className="@container">
      <div className="grid grid-cols-7 text-center text-[11px] font-medium text-muted">
        {WEEKDAYS.map((w) => (
          <div key={w} className="pb-1">
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-md border border-border bg-border">
        {days.map((d) => {
          const list = on(d);
          const outside = month ? d.slice(0, 7) !== month : false;
          const shown = week ? list : list.slice(0, 2);
          return (
            <div
              key={d}
              title={list.length ? `${fmtShortDay(d)}\n${list.map((i) => `• ${i.title}`).join("\n")}` : fmtShortDay(d)}
              className={`min-w-0 p-1 ${week ? "min-h-24" : "min-h-12 @xl:min-h-16"} ${
                isWeekend(d) || outside ? "bg-[color-mix(in_srgb,var(--surface),var(--foreground)_4%)]" : "bg-surface"
              } ${outside ? "text-muted" : ""}`}
            >
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums ${
                  d === now ? "bg-primary text-(--primary-fg)" : ""
                }`}
              >
                {Number(d.slice(8))}
              </span>
              {week ? (
                <div className="mt-1 space-y-0.5">
                  {shown.map((i) => (
                    <Chip key={i.key} item={i} />
                  ))}
                </div>
              ) : (
                <>
                  <div className="mt-1 flex flex-wrap gap-0.5 @xl:hidden">
                    {list.map((i) => (
                      <span key={i.key} className={`h-1.5 w-1.5 rounded-full ${dotClass(i)} ${i.tentative ? "opacity-50" : ""}`} />
                    ))}
                  </div>
                  <div className="mt-1 hidden space-y-0.5 @xl:block">
                    {shown.map((i) => (
                      <Chip key={i.key} item={i} />
                    ))}
                    {list.length > shown.length && <span className="block px-1 text-[10px] text-muted">+{list.length - shown.length} more</span>}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** The items of `first`..`last` grouped by day, each item once (on its first day in the range). */
function AgendaView({ first, last, now, items, empty }: { first: string; last: string; now: string; items: CalendarItem[]; empty: string }) {
  const byDay = new Map<string, CalendarItem[]>();
  for (const i of items) {
    if (i.end < first || i.start > last) continue;
    const d = i.start < first ? first : i.start;
    byDay.set(d, [...(byDay.get(d) ?? []), i]);
  }
  const days = [...byDay.keys()].sort();
  if (!days.length) return <Note>{empty}</Note>;
  return (
    <div className="space-y-3">
      {days.map((d) => (
        <div key={d}>
          <p className={`mb-1 text-xs font-medium ${d === now ? "text-primary" : "text-muted"}`}>{dayLabel(d, now)}</p>
          <ul className="space-y-1">
            {byDay
              .get(d)!
              .sort(sortItems)
              .map((i) => (
                <li key={i.key} className="flex items-center gap-2 text-sm">
                  <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded ${i.tone ?? TYPE_TONE[i.type]}`}>
                    <i className={`pi ${TYPE_ICON[i.type]} text-[10px]`} aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1 truncate" title={[i.title, ...(i.details ?? [])].join("\n")}>
                    {i.title}
                  </span>
                  {i.start !== i.end && <span className="shrink-0 text-xs text-muted">{fmtRange(i.start, i.end)}</span>}
                </li>
              ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Company calendar
// ---------------------------------------------------------------------------------------------

export async function HrCalendarWidget({ auth, raw }: { auth: Auth; raw: unknown }) {
  const cfg = parseConfig("hr-calendar", raw);
  const now = today();
  const { first, last } = cfg.view === "calendar" ? calendarSpan(cfg.length, now) : listSpan(cfg.length, now);
  // A month grid also shows the ends of the weeks around it.
  const [from, to] = cfg.view === "calendar" ? [addDays(first, -6), addDays(last, 6)] : [first, last];
  const { items, narrowed } = await companyCalendar(auth, from, to, cfg.scope === "team");
  return (
    <>
      {cfg.scope === "team" && !narrowed && <p className="mb-2 text-xs text-muted">You aren&apos;t in a team, so this is the whole company.</p>}
      {cfg.view === "calendar" ? (
        <CalendarView first={first} last={last} now={now} items={items} month={cfg.length === "long" ? now.slice(0, 7) : undefined} />
      ) : (
        <AgendaView first={first} last={last} now={now} items={items} empty="Nothing on the calendar in this stretch." />
      )}
      {/* HR itself is for super admins and team leaders: nobody else gets a link to it. */}
      {canUseHr(auth) && (
        <Footer>
          <MoreLink href="/hr">Open the HR calendar</MoreLink>
        </Footer>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// Who's away (the vacation calendar)
// ---------------------------------------------------------------------------------------------

export async function HrAwayWidget({ auth, raw }: { auth: Auth; raw: unknown }) {
  const cfg = parseConfig("hr-away", raw);
  const now = today();
  const team = cfg.scope === "team";

  if (cfg.view === "calendar") {
    // The planner: working days of the week (Monday to Friday) or the month, one row per person who is away.
    const span = calendarSpan(cfg.length, now);
    const [first, last] = cfg.length === "long" ? [span.first, span.last] : [span.first, addDays(span.first, 4)];
    const [entries, holidays] = await Promise.all([awayBetween(auth, first, last, team), holidaysBetween(first, last)]);
    const people = new Map<number, { id: number; name: string; entries: AwayEntry[] }>();
    for (const e of entries) {
      const p = people.get(e.userId) ?? { id: e.userId, name: e.name, entries: [] };
      p.entries.push(e);
      people.set(e.userId, p);
    }
    const shown = new Set(entries.map((e) => e.kind));
    const kinds = [...TIME_OFF_KINDS.filter((k) => shown.has(k)), ...(shown.has("out") ? (["out"] as const) : [])];
    return (
      <>
        {people.size === 0 ? (
          <Note>Nobody is away {cfg.length === "long" ? "this month" : "this week"}.</Note>
        ) : (
          <div className="-mx-4 border-y border-border">
            <VacationGrid
              first={first}
              last={last}
              today={now}
              rows={[...people.values()].sort((a, b) => a.name.localeCompare(b.name))}
              holidays={new Map(holidays.filter((h) => h.dayOff).map((h) => [h.date, h.name]))}
              kinds={kinds}
            />
          </div>
        )}
        {canUseHr(auth) && (
          <Footer>
            <MoreLink href={`/hr/vacations${team ? "?who=team" : ""}`}>Open the vacation planner</MoreLink>
          </Footer>
        )}
      </>
    );
  }

  const { first, last } = listSpan(cfg.length, now);
  const entries = await awayBetween(auth, first, last, team);
  const outToday = entries.filter((e) => e.startDate <= now && e.endDate >= now && !isWeekend(now));
  return (
    <>
      <p className="mb-3 text-sm">
        <span className="font-mono text-2xl font-semibold tabular-nums">{outToday.length}</span>{" "}
        <span className="text-muted">{outToday.length === 1 ? "person is" : "people are"} off today</span>
      </p>
      {entries.length === 0 ? (
        <Note>Nobody is away in the next {cfg.length === "long" ? "30" : "7"} days.</Note>
      ) : (
        <ul className="divide-y divide-border">
          {entries.map((e) => (
            <li key={e.id} className={`flex items-center gap-3 py-2 text-sm ${e.status === "pending" ? "opacity-70" : ""}`}>
              <Avatar name={e.name} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{e.name}</span>
                <span className="block truncate text-xs text-muted">
                  {fmtRange(e.startDate, e.endDate)}
                  {e.halfDay ? " · half day" : ""}
                  {e.status === "pending" ? " · waiting for approval" : ""}
                </span>
              </span>
              {e.kind === "out" ? <span className="badge">Out</span> : <KindBadge kind={e.kind} />}
            </li>
          ))}
        </ul>
      )}
      {canUseHr(auth) && (
        <Footer>
          <MoreLink href={`/hr/vacations${team ? "?who=team" : ""}`}>Open the vacation planner</MoreLink>
        </Footer>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// My vacation days
// ---------------------------------------------------------------------------------------------

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="min-w-0 rounded-md border border-border p-3">
      <p className="truncate text-xs text-muted">{label}</p>
      <p className={`mt-1 font-mono text-2xl tabular-nums ${tone ?? ""}`}>{value}</p>
    </div>
  );
}
const num = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export async function HrMyLeaveWidget({ auth, raw }: { auth: Auth; raw: unknown }) {
  const cfg = parseConfig("hr-my-leave", raw);
  const now = today();
  const year = Number(now.slice(0, 4));
  const me = auth.user;
  const span = cfg.view === "calendar" ? calendarSpan(cfg.length, now) : listSpan(cfg.length, now);
  const [from, to] = cfg.view === "calendar" ? [addDays(span.first, -6), addDays(span.last, 6)] : [now, ymd(year + 1, 12, 31)];

  const [b, mine, daysOff, blockedAhead, holidays, blockedHere] = await Promise.all([
    balanceFor(me.id, year, now),
    db
      .select()
      .from(schema.timeOff)
      .where(and(eq(schema.timeOff.userId, me.id), inArray(schema.timeOff.status, ["approved", "pending"]), gte(schema.timeOff.endDate, cfg.view === "calendar" ? from : now)))
      .orderBy(asc(schema.timeOff.startDate)),
    daysOffBetween(ymd(year, 1, 1), ymd(year + 1, 12, 31)),
    blockedBetween(now, ymd(year + 1, 12, 31)),
    cfg.view === "calendar" ? holidaysBetween(from, to) : Promise.resolve([]),
    cfg.view === "calendar" ? blockedBetween(from, to) : Promise.resolve([]),
  ]);
  const total = b.allowance + b.carriedOver - b.expired;

  const request = (
    <TimeOffButton
      label="Request time off"
      icon="pi-plus"
      outlined
      me={{ id: me.id, name: me.name }}
      people={[]}
      daysOff={[...daysOff]}
      vacationLeft={Math.max(0, b.left - b.pending)}
      selfApproves={auth.role === "super_admin"}
      blocked={blockedAhead.map(({ startDate, endDate, reason }) => ({ startDate, endDate, reason }))}
    />
  );

  const summary =
    cfg.length === "long" ? (
      <div className="mb-3 grid grid-cols-2 gap-2 @lg:grid-cols-4">
        <Stat label="Left" value={num(b.left)} tone="text-sky-600 dark:text-sky-400" />
        <Stat label={`Total ${year}`} value={num(total)} />
        <Stat label="Used" value={num(b.used)} />
        <Stat label="Waiting" value={num(b.pending)} tone={b.pending ? "text-amber-600 dark:text-amber-400" : undefined} />
      </div>
    ) : (
      <div className="mb-3 flex items-end gap-3">
        <span className="font-mono text-3xl font-semibold tabular-nums text-sky-600 dark:text-sky-400">{num(b.left)}</span>
        <span className="pb-1 text-sm text-muted">
          of {num(total)} vacation days left in {year}
          {b.pending > 0 && <span className="text-amber-600 dark:text-amber-400"> · {fmtDays(b.pending)} waiting</span>}
        </span>
      </div>
    );

  let body: React.ReactNode;
  if (cfg.view === "calendar") {
    const items: CalendarItem[] = [
      ...holidays.map((h) => ({
        key: `h-${h.date}-${h.name}`,
        type: (h.dayOff ? "holiday" : "religious") as CalendarItem["type"],
        start: h.date,
        end: h.date,
        title: h.name,
      })),
      ...blockedHere.map((x) => ({ key: `x-${x.id}`, type: "blocked" as const, start: x.startDate, end: x.endDate, title: `Blocked: ${x.reason}` })),
      ...mine.map((t) => ({
        key: `t-${t.id}`,
        type: "time-off" as const,
        start: t.startDate,
        end: t.endDate,
        title: `${KIND_LABEL[t.kind]}${t.halfDay ? " (½)" : ""}`,
        tone: KIND_TONE[t.kind],
        tentative: t.status === "pending",
        details: [t.status === "pending" ? "Waiting for approval" : "Approved"],
      })),
    ];
    body = <CalendarView first={span.first} last={span.last} now={now} items={items} month={cfg.length === "long" ? now.slice(0, 7) : undefined} />;
  } else {
    const upcoming = mine.filter((t) => t.startDate <= span.last || cfg.length === "long").slice(0, cfg.length === "long" ? 10 : 3);
    body = upcoming.length ? (
      <ul className="divide-y divide-border">
        {upcoming.map((t) => (
          <li key={t.id} className="flex items-center justify-between gap-3 py-2 text-sm">
            <span className="min-w-0">
              <span className="block truncate font-medium">{fmtRange(t.startDate, t.endDate)}</span>
              <span className="block text-xs text-muted">
                {fmtDays(countDays(t, daysOff))}
                {t.status === "pending" ? " · waiting for approval" : " · approved"}
              </span>
            </span>
            <KindBadge kind={t.kind as TimeOffKind} />
          </li>
        ))}
      </ul>
    ) : (
      <p className="py-2 text-sm text-muted">No time off planned{cfg.length === "short" ? " in the next 7 days" : ""}.</p>
    );
  }

  return (
    <div className="@container">
      {summary}
      {body}
      <Footer>
        <MoreLink href="/profile/time-off">See all on your profile</MoreLink>
        {request}
      </Footer>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Requests to approve
// ---------------------------------------------------------------------------------------------

export async function HrApprovalsWidget({ auth, raw }: { auth: Auth; raw: unknown }) {
  const cfg = parseConfig("hr-approvals", raw);
  const waiting = await waitingRequests(auth);
  const shown = cfg.length === "long" ? waiting : waiting.slice(0, 3);
  const daysOff = shown.length
    ? await daysOffBetween(
        shown.reduce((m, w) => (w.request.startDate < m ? w.request.startDate : m), shown[0]!.request.startDate),
        shown.reduce((m, w) => (w.request.endDate > m ? w.request.endDate : m), shown[0]!.request.endDate),
      )
    : new Set<string>();
  return (
    <>
      <p className="mb-2 text-sm">
        <span className={`font-mono text-2xl font-semibold tabular-nums ${waiting.length ? "text-amber-600 dark:text-amber-400" : ""}`}>{waiting.length}</span>{" "}
        <span className="text-muted">{waiting.length === 1 ? "request is" : "requests are"} waiting for you</span>
      </p>
      {shown.length === 0 ? (
        <Note>Nothing to approve right now.</Note>
      ) : (
        <ul className="divide-y divide-border">
          {shown.map(({ request: t, person }) => (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm transition-opacity has-data-pending:opacity-50">
              <span className="flex min-w-0 items-center gap-2.5">
                <Avatar name={person.name} size="sm" />
                <span className="min-w-0">
                  <span className="block truncate font-medium">{person.name}</span>
                  <span className="block truncate text-xs text-muted">
                    {KIND_LABEL[t.kind]} · {fmtRange(t.startDate, t.endDate)} · {fmtDays(countDays(t, daysOff))}
                  </span>
                </span>
              </span>
              <DecideButtons id={t.id} name={person.name} />
            </li>
          ))}
        </ul>
      )}
      <Footer>
        <MoreLink href="/hr/approvals">{waiting.length > shown.length ? `See all ${waiting.length}` : "Open approvals"}</MoreLink>
      </Footer>
    </>
  );
}
