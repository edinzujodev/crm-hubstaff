import { and, asc, gte, inArray, lte } from "drizzle-orm";
import { connection } from "next/server";
import { db, schema } from "@/db";
import { HrSuspense, HrTabs } from "@/components/hr-tabs";
import { MonthSwitch, WhoSwitch } from "@/components/hr-switches";
import { TimeOffButton } from "@/components/time-off";
import { VacationGrid, type GridEntry } from "@/components/vacation-grid";
import { HR_ROLES, pageGuard } from "@/lib/auth";
import { config } from "@/lib/config";
import { monthBounds, ymd } from "@/lib/days";
import { localDay } from "@/lib/format";
import { blockedBetween, daysOffBetween, holidaysBetween } from "@/lib/holidays";
import { managedPeople } from "@/lib/hr";
import { TIME_OFF_KINDS, type TimeOffKind } from "@/lib/leave-days";
import { balanceFor, canManagePerson } from "@/lib/time-off";

/**
 * Who is away when, as a month planner. Everyone sees who is out; the kind of time off and requests still waiting
 * only show for themselves and the people they approve for (so sick leave stays private).
 */
async function VacationsContent({ params }: { params: Promise<{ m?: string; who?: string }> }) {
  await connection();
  const auth = await pageGuard(...HR_ROLES);
  const today = localDay(new Date(), config.timeZone);
  const { m, who } = await params;
  const month = m && /^\d{4}-(0[1-9]|1[0-2])$/.test(m) ? m : today.slice(0, 7);
  const { first, last } = monthBounds(month);
  const year = Number(today.slice(0, 4));
  const myTeams = [...new Set([auth.user.teamId, ...auth.ledTeamIds].filter((t): t is number => t !== null))];
  const teamOnly = who === "team" && myTeams.length > 0;

  const [users, teams, entries, holidays, balance, people, daysOff, blocked] = await Promise.all([
    db
      .select({ id: schema.users.id, name: schema.users.name, teamId: schema.users.teamId, jobTitle: schema.users.jobTitle })
      .from(schema.users)
      .where(teamOnly ? inArray(schema.users.teamId, myTeams) : undefined)
      .orderBy(asc(schema.users.name)),
    db.select({ id: schema.teams.id, name: schema.teams.name }).from(schema.teams),
    db
      .select()
      .from(schema.timeOff)
      .where(
        and(
          lte(schema.timeOff.startDate, last),
          gte(schema.timeOff.endDate, first),
          inArray(schema.timeOff.status, ["approved", "pending"]),
        ),
      ),
    holidaysBetween(first, last),
    balanceFor(auth.user.id, year, today),
    managedPeople(auth),
    daysOffBetween(ymd(year - 1, 1, 1), ymd(year + 1, 12, 31)),
    blockedBetween(today, ymd(year + 1, 12, 31)),
  ]);
  const teamName = new Map(teams.map((t) => [t.id, t.name]));
  const shownKinds = new Set<TimeOffKind | "out">();

  const rows = users.map((u) => {
    const full = canManagePerson(auth, u);
    const mine: GridEntry[] = entries
      .filter((t) => t.userId === u.id && (full || t.status === "approved"))
      .map((t) => {
        const kind = full ? t.kind : "out";
        shownKinds.add(kind);
        return { startDate: t.startDate, endDate: t.endDate, halfDay: t.halfDay, status: t.status, kind, note: full ? t.note : null };
      });
    return { id: u.id, name: u.name, sub: u.jobTitle ?? (u.teamId ? teamName.get(u.teamId) : undefined), entries: mine };
  });
  // The legend explains vacation and sick leave always, the other kinds once they appear.
  const kinds = [...TIME_OFF_KINDS.filter((k) => k === "vacation" || k === "sick" || shownKinds.has(k)), ...(shownKinds.has("out") ? (["out"] as const) : [])];

  const form = {
    me: { id: auth.user.id, name: auth.user.name },
    people: people.map((p) => ({ id: p.id, name: p.name })),
    daysOff: [...daysOff],
    vacationLeft: Math.max(0, balance.left - balance.pending),
    selfApproves: auth.role === "super_admin",
    blocked: blocked.map(({ startDate, endDate, reason }) => ({ startDate, endDate, reason })),
  };

  return (
    <HrTabs
      auth={auth}
      active="vacations"
      // One button for every kind: the form picks vacation, sick leave and the rest, and (for approvers) the person.
      actions={<TimeOffButton {...form} label="Add time off" icon="pi-plus" />}
      toolbar={
        <>
          <WhoSwitch base="/hr/vacations" month={month} team={teamOnly} hasTeam={myTeams.length > 0} />
          <MonthSwitch base="/hr/vacations" month={month} current={today.slice(0, 7)} team={teamOnly} />
        </>
      }
    >
      <VacationGrid
        first={first}
        last={last}
        today={today}
        rows={rows}
        holidays={new Map(holidays.filter((h) => h.dayOff).map((h) => [h.date, h.name]))}
        kinds={kinds}
      />
    </HrTabs>
  );
}

export default function VacationsPage({ searchParams }: PageProps<"/hr/vacations">) {
  const params = searchParams.then((p) => ({
    m: typeof p.m === "string" ? p.m : undefined,
    who: typeof p.who === "string" ? p.who : undefined,
  }));
  return (
    <div className="space-y-6">
      <h1 className="sr-only">Vacations</h1>
      <HrSuspense toolbar actions={["Add time off"]}>
        <VacationsContent params={params} />
      </HrSuspense>
    </div>
  );
}
