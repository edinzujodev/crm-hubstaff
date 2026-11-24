import { ListSkeleton } from "@/components/page-skeleton";
import { Suspense } from "react";
import { and, desc, eq, gte } from "drizzle-orm";
import { connection } from "next/server";
import { db, schema } from "@/db";
import { DataGrid } from "@/components/data-grid";
import { HrTabs } from "@/components/hr-tabs";
import { BalanceTiles, fmtNum } from "@/components/balance-tiles";
import { CancelTimeOffButton, KindBadge, StatusBadge, TimeOffButton } from "@/components/time-off";
import { pageGuard } from "@/lib/auth";
import { config } from "@/lib/config";
import { fmtRange, ymd } from "@/lib/days";
import { localDay } from "@/lib/format";
import { daysOffBetween } from "@/lib/holidays";
import { managedPeople } from "@/lib/hr";
import { balanceFor, countDays } from "@/lib/time-off";

/** Your own time off: what is left, what you asked for, and buttons to ask for more or report sick. */
async function TimeOffContent() {
  await connection();
  const auth = await pageGuard();
  const today = localDay(new Date(), config.timeZone);
  const year = Number(today.slice(0, 4));
  const [balance, people, mine, daysOff] = await Promise.all([
    balanceFor(auth.user.id, year, today),
    managedPeople(auth),
    db
      .select()
      .from(schema.timeOff)
      .where(and(eq(schema.timeOff.userId, auth.user.id), gte(schema.timeOff.endDate, ymd(year - 1, 1, 1))))
      .orderBy(desc(schema.timeOff.startDate)),
    daysOffBetween(ymd(year - 1, 1, 1), ymd(year + 1, 12, 31)),
  ]);
  const names = new Map(
    (await db.select({ id: schema.users.id, name: schema.users.name }).from(schema.users)).map((u) => [u.id, u.name]),
  );

  const formProps = {
    me: { id: auth.user.id, name: auth.user.name },
    people: people.map((p) => ({ id: p.id, name: p.name })),
    daysOff: [...daysOff],
    vacationLeft: Math.max(0, balance.left - balance.pending),
    selfApproves: auth.role === "super_admin",
  };

  return (
    <div className="space-y-6">
      <BalanceTiles b={balance} today={today} />
      <HrTabs
        auth={auth}
        active="time-off"
        actions={
          <>
            <TimeOffButton {...formProps} label="Add sick leave" icon="pi-heart" kind="sick" outlined />
            <TimeOffButton {...formProps} label="Request time off" icon="pi-plus" />
          </>
        }
      >
        <DataGrid
          flush
          empty="You haven't taken or asked for any time off yet."
          headers={["Dates", "Kind", { label: "Days", align: "right" }, "Status", "Note"]}
          rows={mine.map((t) => ({
            key: t.id,
            sort: [t.startDate, t.kind, null, t.status, null],
            tone: t.status === "pending" ? "approaching" : undefined,
            cells: [
              <span key="d" className="whitespace-nowrap font-medium">
                {fmtRange(t.startDate, t.endDate)}
                {t.halfDay && <span className="text-muted"> · half day</span>}
              </span>,
              <KindBadge key="k" kind={t.kind} />,
              <span key="n" className="font-mono tabular-nums">
                {fmtNum(countDays(t, daysOff))}
              </span>,
              <span key="s" className="flex flex-col gap-0.5">
                <StatusBadge status={t.status} />
                {t.decidedById && t.status !== "pending" && t.decidedById !== auth.user.id && (
                  <span className="text-xs text-muted">by {names.get(t.decidedById) ?? "someone"}</span>
                )}
              </span>,
              <span key="note" className="text-sm">
                {t.note && <span className="block text-muted">{t.note}</span>}
                {t.decisionNote && <span className="block">“{t.decisionNote}”</span>}
              </span>,
            ],
            actions:
              t.status === "pending" || (t.status === "approved" && (t.startDate > today || t.kind === "sick")) ? (
                <CancelTimeOffButton id={t.id} />
              ) : undefined,
          }))}
        />
      </HrTabs>
    </div>
  );
}

export default function TimeOffPage() {
  return (
    <div className="space-y-6">
      <h1 className="sr-only">Time off</h1>
      <Suspense fallback={<ListSkeleton />}>
        <TimeOffContent />
      </Suspense>
    </div>
  );
}
