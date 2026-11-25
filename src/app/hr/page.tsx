import Link from "next/link";
import { connection } from "next/server";
import { HrCalendar, NewEventButton } from "@/components/hr-calendar";
import type { EventTeamOption } from "@/components/event-form";
import { HrSuspense, HrTabs } from "@/components/hr-tabs";
import { MonthSwitch, WhoSwitch } from "@/components/hr-switches";
import { pageGuard } from "@/lib/auth";
import { config } from "@/lib/config";
import { monthBounds, ymd } from "@/lib/days";
import { localDay } from "@/lib/format";
import { companyCalendar, myTeamIds } from "@/lib/hr-calendar";

function Legend({ tone, label }: { tone: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-2.5 w-2.5 rounded-sm ${tone}`} aria-hidden />
      {label}
    </span>
  );
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
  const myTeams = myTeamIds(auth);
  // The grid shows a few days of the months around this one too.
  const [from, to] = [ymd(year, Number(month.slice(5)) - 1, 23), ymd(year, Number(month.slice(5)) + 1, 7)];

  const { items, teams, narrowed: teamOnly } = await companyCalendar(auth, from, to, who === "team");

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
            <Legend tone="bg-red-500/40" label="Blocked for time off" />
            <span className="ml-auto">
              Who is away:{" "}
              <Link href="/hr/vacations" className="underline hover:text-foreground">
                Vacations
              </Link>
            </span>
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
