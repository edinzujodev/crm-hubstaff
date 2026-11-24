import { and, asc, gte, inArray, isNull, lte, ne, or } from "drizzle-orm";
import { connection } from "next/server";
import { db, schema } from "@/db";
import { HrCalendar, NewEventButton, type CalendarItem } from "@/components/hr-calendar";
import type { EventTeamOption } from "@/components/event-form";
import { HrSuspense, HrTabs } from "@/components/hr-tabs";
import { MonthSwitch, WhoSwitch } from "@/components/hr-switches";
import { pageGuard } from "@/lib/auth";
import { config } from "@/lib/config";
import { monthBounds, ymd } from "@/lib/days";
import { localDay } from "@/lib/format";
import { holidaysBetween } from "@/lib/holidays";
import { describeRepeat, occurrences } from "@/lib/recurrence";
import { canManagePerson, KIND_LABEL, KIND_TONE } from "@/lib/time-off";

function Legend({ tone, label }: { tone: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-2.5 w-2.5 rounded-sm ${tone}`} aria-hidden />
      {label}
    </span>
  );
}

/** "Edin Zujo" -> "Edin Z.": short enough for a calendar cell, still tells two Edins apart. */
function shortName(name: string) {
  const [first, ...rest] = name.trim().split(/\s+/);
  const last = rest.at(-1);
  return last ? `${first} ${last[0]}.` : first!;
}

/** A birthday or start date in this month's year; 29 February falls on the 28th in other years. */
function sameDayIn(year: number, day: string) {
  const [m, d] = [Number(day.slice(5, 7)), Number(day.slice(8))];
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return ymd(year, m, m === 2 && d === 29 && !leap ? 28 : d);
}

async function CalendarContent({ params }: { params: Promise<{ m?: string; who?: string }> }) {
  await connection();
  const auth = await pageGuard();
  const admin = auth.role === "super_admin";
  const today = localDay(new Date(), config.timeZone);
  const { m, who } = await params;
  const month = m && /^\d{4}-(0[1-9]|1[0-2])$/.test(m) ? m : today.slice(0, 7);
  const { first, last } = monthBounds(month);
  const year = Number(month.slice(0, 4));
  // "My team": the person's own team, plus the teams they lead.
  const myTeams = [...new Set([auth.user.teamId, ...auth.ledTeamIds].filter((t): t is number => t !== null))];
  const teamOnly = who === "team" && myTeams.length > 0;
  // The grid shows a few days of the months around this one too.
  const [from, to] = [ymd(year, Number(month.slice(5)) - 1, 23), ymd(year, Number(month.slice(5)) + 1, 7)];

  const [users, teams, holidays, events, timeOff] = await Promise.all([
    db.select().from(schema.users).orderBy(asc(schema.users.name)),
    db.select({ id: schema.teams.id, name: schema.teams.name }).from(schema.teams).orderBy(asc(schema.teams.name)),
    holidaysBetween(from, to),
    db
      .select()
      .from(schema.events)
      .where(
        and(
          lte(schema.events.startDate, to),
          // A repeating event can show up long after its first day; occurrences() picks the dates below.
          or(gte(schema.events.endDate, from), ne(schema.events.repeat, "none")),
          admin && !teamOnly
            ? undefined
            : myTeams.length
              ? or(isNull(schema.events.teamId), inArray(schema.events.teamId, myTeams))
              : isNull(schema.events.teamId),
        ),
      ),
    db
      .select()
      .from(schema.timeOff)
      .where(
        and(
          lte(schema.timeOff.startDate, to),
          gte(schema.timeOff.endDate, from),
          inArray(schema.timeOff.status, ["approved", "pending"]),
        ),
      ),
  ]);
  const inScope = (u: { teamId: number | null }) => !teamOnly || (u.teamId !== null && myTeams.includes(u.teamId));
  const person = new Map(users.map((u) => [u.id, u]));
  const teamName = new Map(teams.map((t) => [t.id, t.name]));
  const items: CalendarItem[] = [];

  for (const h of holidays) {
    items.push({
      key: `h-${h.date}-${h.name}`,
      type: h.dayOff ? "holiday" : "religious",
      start: h.date,
      end: h.date,
      title: h.name,
      details: [h.dayOff ? "Public holiday: a day off for everyone." : "Religious holiday."],
    });
  }

  const canEdit = (teamId: number | null) => admin || (teamId !== null && auth.role === "leader" && auth.ledTeamIds.includes(teamId));
  for (const e of events) {
    const time = e.startTime ? `${e.startTime}${e.endTime ? `–${e.endTime}` : ""}` : null;
    const repeats = describeRepeat(e);
    const editable = canEdit(e.teamId)
      ? {
          id: e.id,
          title: e.title,
          description: e.description,
          location: e.location,
          startDate: e.startDate,
          endDate: e.endDate,
          startTime: e.startTime,
          endTime: e.endTime,
          teamId: e.teamId,
          repeat: e.repeat,
          repeatDays: e.repeatDays,
          repeatUntil: e.repeatUntil,
        }
      : undefined;
    for (const o of occurrences(e, from, to)) {
      items.push({
        key: `e-${e.id}-${o.start}`,
        type: "event",
        start: o.start,
        end: o.end,
        title: time && o.start === o.end ? `${e.startTime} ${e.title}` : e.title,
        repeats: !!repeats,
        details: [
          time ? `Time: ${time}` : "All day",
          repeats ? `Repeats: ${repeats}` : "",
          e.location ? `Place: ${e.location}` : "",
          `For: ${e.teamId ? (teamName.get(e.teamId) ?? "a team") : "the whole company"}`,
          e.description ?? "",
        ].filter(Boolean),
        event: editable,
      });
    }
  }

  for (const u of users) {
    if (!inScope(u)) continue;
    for (const y of new Set([Number(from.slice(0, 4)), Number(to.slice(0, 4))])) {
      if (u.birthDate) {
        const day = sameDayIn(y, u.birthDate);
        if (day >= from && day <= to) {
          items.push({ key: `b-${u.id}-${y}`, type: "birthday", start: day, end: day, title: `${u.name}'s birthday`, details: ["🎂 Say happy birthday!"] });
        }
      }
      if (u.startedOn) {
        const day = sameDayIn(y, u.startedOn);
        const years = y - Number(u.startedOn.slice(0, 4));
        if (years > 0 && day >= from && day <= to) {
          items.push({
            key: `a-${u.id}-${y}`,
            type: "anniversary",
            start: day,
            end: day,
            title: `${u.name} · ${years} ${years === 1 ? "year" : "years"}`,
            details: [`${years} ${years === 1 ? "year" : "years"} at the company.`],
          });
        }
      }
    }
  }

  for (const t of timeOff) {
    const u = person.get(t.userId);
    if (!u || !inScope(u)) continue;
    // Everyone sees who is out; the reason only the person and whoever approves for them.
    const full = canManagePerson(auth, u);
    if (t.status === "pending" && !full) continue;
    const what = full ? KIND_LABEL[t.kind] : "Out";
    items.push({
      key: `t-${t.id}`,
      type: "time-off",
      start: t.startDate,
      end: t.endDate,
      title: `${shortName(u.name)} · ${what}${t.halfDay ? " (½)" : ""}`,
      tone: full ? KIND_TONE[t.kind] : undefined,
      tentative: t.status === "pending",
      details: [
        `${u.name} is out${t.halfDay ? " for half a day" : ""}.`,
        full ? `${what}${t.status === "pending" ? ", waiting for approval" : ""}.` : "",
        full && t.note ? `Note: ${t.note}` : "",
      ].filter(Boolean),
    });
  }

  const eventTeams: EventTeamOption[] = admin
    ? [{ id: null, name: "Whole company" }, ...teams]
    : teams.filter((t) => auth.ledTeamIds.includes(t.id));

  return (
    <HrTabs
      auth={auth}
      active="calendar"
      actions={eventTeams.length ? <NewEventButton teams={eventTeams} /> : undefined}
      toolbar={
        <>
          <WhoSwitch base="/hr" month={month} team={teamOnly} hasTeam={myTeams.length > 0} />
          <MonthSwitch base="/hr" month={month} current={today.slice(0, 7)} team={teamOnly} />
        </>
      }
    >
      <HrCalendar
        month={month}
        first={first}
        last={last}
        today={today}
        items={items}
        eventTeams={eventTeams}
        legend={
          <>
            <Legend tone="bg-primary" label="Event" />
            <Legend tone="bg-emerald-500/40" label="Public holiday" />
            <Legend tone="bg-amber-500/40" label="Religious holiday" />
            <Legend tone="bg-pink-500/40" label="Birthday" />
            <Legend tone="bg-indigo-500/40" label="Work anniversary" />
            <Legend tone="bg-sky-500/40" label="Time off" />
            <span className="ml-auto">Dashed: waiting for approval</span>
          </>
        }
      />
    </HrTabs>
  );
}

/** HR home: the company calendar. */
export default function HrPage({ searchParams }: PageProps<"/hr">) {
  const params = searchParams.then((p) => ({
    m: typeof p.m === "string" ? p.m : undefined,
    who: typeof p.who === "string" ? p.who : undefined,
  }));
  return (
    <div className="space-y-6">
      <h1 className="sr-only">HR calendar</h1>
      <HrSuspense actions={(a) => (a.role === "super_admin" || a.ledTeamIds.length ? ["New event"] : undefined)}>
        <CalendarContent params={params} />
      </HrSuspense>
    </div>
  );
}
