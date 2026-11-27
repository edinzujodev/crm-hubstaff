import { and, desc, inArray, ne } from "drizzle-orm";
import { connection } from "next/server";
import { db, schema } from "@/db";
import { Avatar } from "@/components/avatar";
import { fmtNum } from "@/components/balance-tiles";
import { DataGrid } from "@/components/data-grid";
import { HrSuspense, HrTabs } from "@/components/hr-tabs";
import { DecideButtons, KindBadge, StatusBadge, WithdrawTimeOffButton } from "@/components/time-off";
import { ChangeTimeOffButton, TimeOffFormProvider } from "@/components/time-off-entry";
import { pageGuard } from "@/lib/auth";
import { config } from "@/lib/config";
import { fmtLongDay, fmtRange, ymd } from "@/lib/days";
import { localDay } from "@/lib/format";
import { blockedBetween, daysOffBetween } from "@/lib/holidays";
import { managedPeople, waitingRequests } from "@/lib/hr";
import { canDecide, countDays } from "@/lib/time-off";

/**
 * For team leaders and super admins: requests waiting for a decision, and the recent time off of the people they look
 * after (to change or cancel). Vacation days per person are on Balances.
 */
async function RequestsContent() {
  await connection();
  const auth = await pageGuard("super_admin", "leader");
  const admin = auth.role === "super_admin";
  const today = localDay(new Date(), config.timeZone);
  const year = Number(today.slice(0, 4));
  const [waiting, people] = await Promise.all([waitingRequests(auth), managedPeople(auth)]);
  // A super admin also sees (and sets) their own days here.
  const everyone = admin
    ? await db
        .select({ id: schema.users.id, name: schema.users.name, teamId: schema.users.teamId, annual: schema.users.annualLeaveDays })
        .from(schema.users)
    : people.map((p) => ({ ...p, annual: null }));
  const ids = everyone.map((p) => p.id);
  const [rows, blocked] = await Promise.all([
    ids.length
      ? db
          .select()
          .from(schema.timeOff)
          .where(
            and(
              inArray(schema.timeOff.userId, ids),
              ne(schema.timeOff.status, "pending"),
            ),
          )
          .orderBy(desc(schema.timeOff.startDate))
      : [],
    blockedBetween(today, ymd(year + 1, 12, 31)),
  ]);
  // Public holidays from the oldest time off on, so every row counts its days right.
  const daysOff = await daysOffBetween(
    rows.reduce((m, t) => (t.startDate < m ? t.startDate : m), ymd(year - 1, 1, 1)),
    ymd(year + 1, 12, 31),
  );
  const name = new Map(everyone.map((p) => [p.id, p.name]));
  // The last say on each time off: who cancelled it, or else who approved or rejected it. They may be outside the
  // people listed (a super admin, a lead above).
  const decidedBy = (t: (typeof rows)[number]) => (t.status === "cancelled" ? t.cancelledById : t.decidedById);
  const deciderIds = [...new Set(rows.map(decidedBy).filter((id): id is number => id !== null))];
  const deciders = new Map(
    deciderIds.length
      ? (await db.select({ id: schema.users.id, name: schema.users.name }).from(schema.users).where(inArray(schema.users.id, deciderIds))).map(
          (u) => [u.id, u.name],
        )
      : [],
  );
  const byId = new Map(everyone.map((p) => [p.id, p]));
  // For changing someone's time off from the list at the bottom.
  const form = {
    me: { id: auth.user.id, name: auth.user.name },
    people: [],
    daysOff: [...daysOff],
    vacationLeft: 0,
    selfApproves: admin,
    today,
    blocked: blocked.map(({ startDate, endDate, reason }) => ({ startDate, endDate, reason })),
  };

  return (
    <>
    <HrTabs
      auth={auth}
      active="requests"
    >
        <DataGrid
          flush
          pageSize={10}
          empty="Nothing to approve right now."
          headers={["Person", "Dates", "Kind", { label: "Days", align: "right" }, "Note", "Asked"]}
          rows={waiting.map(({ request: t, person }) => ({
            key: t.id,
            cells: [
              <span key="p" className="flex items-center gap-2 font-medium">
                <Avatar name={person.name} userId={person.id} size="sm" />
                {person.name}
              </span>,
              <span key="d" className="whitespace-nowrap">
                {fmtRange(t.startDate, t.endDate)}
                {t.halfDay && <span className="text-muted"> · half day</span>}
              </span>,
              <KindBadge key="k" kind={t.kind} />,
              <span key="n" className="font-mono tabular-nums">
                {fmtNum(countDays(t, daysOff))}
              </span>,
              <span key="note" className="text-sm text-muted">
                {t.note || "—"}
              </span>,
              <span key="a" className="whitespace-nowrap text-xs text-muted">
                {fmtLongDay(localDay(t.createdAt, config.timeZone))}
              </span>,
            ],
            actions: <DecideButtons id={t.id} name={person.name} />,
          }))}
        />
    </HrTabs>

    {/* The history is a box of its own under the requests. */}
    <TimeOffFormProvider value={form}>
      <div className="card overflow-hidden">
        <div className="flex min-h-16 items-center border-b border-border px-4 py-3">
          <h2 className="text-base font-semibold">Time off</h2>
        </div>
        <DataGrid
          flush
          pageSize={10}
          empty="No time off yet."
          headers={["Person", "Dates", "Kind", { label: "Days", align: "right" }, "Status", "Decided by"]}
          rows={rows.map((t) => ({
            key: t.id,
            sort: [name.get(t.userId), t.startDate, t.kind, null, t.status, deciders.get(decidedBy(t) ?? -1) ?? ""],
            cells: [
              <span key="p" className="font-medium">
                {name.get(t.userId)}
              </span>,
              <span key="d" className="whitespace-nowrap">
                {fmtRange(t.startDate, t.endDate)}
                {t.halfDay && <span className="text-muted"> · half day</span>}
              </span>,
              <KindBadge key="k" kind={t.kind} />,
              <span key="n" className="font-mono tabular-nums">
                {fmtNum(countDays(t, daysOff))}
              </span>,
              <StatusBadge key="s" status={t.status} kind={t.kind} />,
              <span key="by" className={decidedBy(t) ? "" : "text-muted"}>
                {deciders.get(decidedBy(t) ?? -1) ?? "—"}
              </span>,
            ],
            actions:
              t.status === "approved" && canDecide(auth, byId.get(t.userId) ?? { id: t.userId, teamId: null }) ? (
                <span className="flex items-center">
                  {/* Time off that is already over can't be taken back. */}
                  {t.endDate >= today && <WithdrawTimeOffButton id={t.id} />}
                  <ChangeTimeOffButton t={{ ...t, name: name.get(t.userId) ?? "" }} />
                </span>
              ) : undefined,
          }))}
        />
      </div>
    </TimeOffFormProvider>
    </>
  );
}

export default function RequestsPage() {
  return (
    <div className="space-y-4">
      <h1 className="sr-only">Requests</h1>
      <HrSuspense>
        <RequestsContent />
      </HrSuspense>
    </div>
  );
}
