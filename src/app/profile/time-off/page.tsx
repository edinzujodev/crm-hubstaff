import { Suspense } from "react";
import { connection } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { LeaveTiles } from "@/components/balance-tiles";
import { LeaveRequests, type LeaveRequest } from "@/components/leave-requests";
import { TimeOffSkeleton } from "@/components/page-skeleton";
import { SectionHead } from "@/components/section-head";
import { TimeOffButton } from "@/components/time-off";
import { pageGuard } from "@/lib/auth";
import { config } from "@/lib/config";
import { ymd } from "@/lib/days";
import { localDay } from "@/lib/format";
import { blockedBetween, daysOffBetween } from "@/lib/holidays";
import { countDays, TIME_OFF_KINDS, type TimeOffKind } from "@/lib/leave-days";
import { balanceFor, teamOffFor } from "@/lib/time-off";

async function TimeOffContent() {
  await connection();
  const auth = await pageGuard();
  const me = auth.user;
  const today = localDay(new Date(), config.timeZone);
  const year = Number(today.slice(0, 4));
  const yearStart = ymd(year, 1, 1);
  const yearEnd = ymd(year, 12, 31);

  const [balance, history, formDaysOff, blocked, team] = await Promise.all([
    balanceFor(me.id, year, today),
    db.select().from(schema.timeOff).where(eq(schema.timeOff.userId, me.id)).orderBy(desc(schema.timeOff.startDate)),
    // For the request form: it counts working days and shows holidays and blocked days in the picker.
    daysOffBetween(yearStart, ymd(year + 1, 12, 31)),
    blockedBetween(today, ymd(year + 1, 12, 31)),
    // A worker sees their team's calendar in the form, and can't pick days the team is full on.
    teamOffFor(auth, today, ymd(year + 1, 12, 31)),
  ]);
  // Public holidays inside the history (and this year, for the tiles) don't count as days taken.
  const daysOff = await daysOffBetween(
    history.reduce((m, t) => (t.startDate < m ? t.startDate : m), yearStart),
    history.reduce((m, t) => (t.endDate > m ? t.endDate : m), yearEnd),
  );
  const taken = Object.fromEntries(TIME_OFF_KINDS.map((k) => [k, 0])) as Record<TimeOffKind, number>;
  for (const t of history) {
    if (t.status === "approved") taken[t.kind] += countDays(t, daysOff, yearStart, yearEnd);
  }
  const requests: LeaveRequest[] = history.map((t) => ({
    id: t.id,
    kind: t.kind,
    status: t.status,
    startDate: t.startDate,
    endDate: t.endDate,
    halfDay: t.halfDay,
    days: countDays(t, daysOff),
    decisionNote: t.decisionNote,
    // Requests still waiting, and time off that hasn't started yet, can be called off.
    cancellable: t.status === "pending" || (t.status === "approved" && (t.startDate > today || t.kind === "sick")),
  }));

  return (
    <div className="space-y-4">
      <h1 className="sr-only">My time off</h1>
      <div className="flex justify-start">
        <TimeOffButton
          label="Add request"
          icon="pi-plus"
          me={{ id: me.id, name: me.name }}
          people={[]}
          daysOff={[...formDaysOff]}
          vacationLeft={Math.max(0, balance.left - balance.pending)}
          selfApproves={auth.role === "super_admin"}
          blocked={blocked.map(({ startDate, endDate, reason }) => ({ startDate, endDate, reason }))}
          team={team}
          today={today}
        />
      </div>
      <LeaveTiles b={balance} taken={taken} today={today} />
      <section className="card overflow-hidden p-5 pb-0">
        <SectionHead title="My requests" />
        <div className="-mx-5">
          <LeaveRequests items={requests} />
        </div>
      </section>
    </div>
  );
}

export default function ProfileTimeOffPage() {
  return (
    <Suspense fallback={<TimeOffSkeleton />}>
      <TimeOffContent />
    </Suspense>
  );
}
