import { and, asc, eq, gte, inArray, isNull, lte, ne, or } from "drizzle-orm";
import { db, schema } from "@/db";
import type { CalendarItem } from "@/components/hr-calendar";
import type { Auth } from "@/lib/auth";
import { fmtRange, ymd } from "@/lib/days";
import { blockedBetween, holidaysBetween } from "@/lib/holidays";
import { canManagePerson, type TimeOffKind, type TimeOffStatus } from "@/lib/time-off";
import { describeRepeat, occurrences } from "@/lib/recurrence";

/** The teams whose things "My team" shows: the person's own team, plus the teams they lead. */
export const myTeamIds = (auth: Auth) =>
  [...new Set([auth.user.teamId, ...auth.ledTeamIds].filter((t): t is number => t !== null))];

/** A birthday or start date in a given year; 29 February falls on the 28th in other years. */
function sameDayIn(year: number, day: string) {
  const [m, d] = [Number(day.slice(5, 7)), Number(day.slice(8))];
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return ymd(year, m, m === 2 && d === 29 && !leap ? 28 : d);
}

/**
 * Everything on the company calendar from `from` to `to`: holidays, days blocked for time off, events (repeats
 * spread out), birthdays and work anniversaries. With `teamOnly`, events and people are narrowed to the person's
 * teams. Items carry edit data when the person may change them (the /hr page uses it; widgets ignore it).
 */
export async function companyCalendar(auth: Auth, from: string, to: string, teamOnly = false) {
  const admin = auth.role === "super_admin";
  const myTeams = myTeamIds(auth);
  const narrowed = teamOnly && myTeams.length > 0;

  const [users, teams, holidays, blocked, events] = await Promise.all([
    db.select().from(schema.users).orderBy(asc(schema.users.name)),
    db.select({ id: schema.teams.id, name: schema.teams.name }).from(schema.teams).orderBy(asc(schema.teams.name)),
    holidaysBetween(from, to),
    blockedBetween(from, to),
    db
      .select()
      .from(schema.events)
      .where(
        and(
          lte(schema.events.startDate, to),
          // A repeating event can show up long after its first day; occurrences() picks the dates below.
          or(gte(schema.events.endDate, from), ne(schema.events.repeat, "none")),
          admin && !narrowed
            ? undefined
            : myTeams.length
              ? or(isNull(schema.events.teamId), inArray(schema.events.teamId, myTeams))
              : isNull(schema.events.teamId),
        ),
      ),
  ]);
  const inScope = (u: { teamId: number | null }) => !narrowed || (u.teamId !== null && myTeams.includes(u.teamId));
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
      holiday: admin ? { date: h.date, name: h.name, dayOff: h.dayOff, source: h.source, id: h.id } : undefined,
    });
  }

  for (const b of blocked) {
    items.push({
      key: `x-${b.id}`,
      type: "blocked",
      start: b.startDate,
      end: b.endDate,
      title: `Blocked: ${b.reason}`,
      details: [`Nobody can take time off ${fmtRange(b.startDate, b.endDate)}.`, "Sick leave can still be recorded."],
      blockId: admin ? b.id : undefined,
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

  return { items, teams, narrowed };
}

export type AwayEntry = {
  id: number;
  userId: number;
  name: string;
  teamId: number | null;
  startDate: string;
  endDate: string;
  halfDay: boolean;
  status: TimeOffStatus;
  /** "out" when the viewer may only know the person is away, not why. */
  kind: TimeOffKind | "out";
  note: string | null;
};

/**
 * Who is away from `from` to `to`. Everyone sees who is out; the kind, the note and requests still waiting only
 * show for the person themselves and whoever approves for them (so sick leave stays private).
 */
export async function awayBetween(auth: Auth, from: string, to: string, teamOnly = false): Promise<AwayEntry[]> {
  const myTeams = myTeamIds(auth);
  const narrowed = teamOnly && myTeams.length > 0;
  const rows = await db
    .select({ t: schema.timeOff, u: { id: schema.users.id, name: schema.users.name, teamId: schema.users.teamId } })
    .from(schema.timeOff)
    .innerJoin(schema.users, eq(schema.timeOff.userId, schema.users.id))
    .where(
      and(
        lte(schema.timeOff.startDate, to),
        gte(schema.timeOff.endDate, from),
        inArray(schema.timeOff.status, ["approved", "pending"]),
        narrowed ? inArray(schema.users.teamId, myTeams) : undefined,
      ),
    )
    .orderBy(asc(schema.timeOff.startDate), asc(schema.users.name));
  const out: AwayEntry[] = [];
  for (const { t, u } of rows) {
    const full = canManagePerson(auth, u);
    if (t.status === "pending" && !full) continue;
    out.push({
      id: t.id,
      userId: u.id,
      name: u.name,
      teamId: u.teamId,
      startDate: t.startDate,
      endDate: t.endDate,
      halfDay: t.halfDay,
      status: t.status,
      kind: full ? t.kind : "out",
      note: full ? t.note : null,
    });
  }
  return out;
}
