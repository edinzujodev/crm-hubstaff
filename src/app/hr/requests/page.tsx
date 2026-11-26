import { and, desc, gte, inArray, ne } from "drizzle-orm";
import { connection } from "next/server";
import { db, schema } from "@/db";
import { Avatar } from "@/components/avatar";
import { fmtNum } from "@/components/balance-tiles";
import { DataGrid } from "@/components/data-grid";
import { HrSuspense, HrTabs } from "@/components/hr-tabs";
import { CancelTimeOffButton, DecideButtons, KindBadge, StatusBadge } from "@/components/time-off";
import { ChangeTimeOffButton, TimeOffFormProvider } from "@/components/time-off-entry";
import { pageGuard } from "@/lib/auth";
import { config } from "@/lib/config";
import { addDays, fmtLongDay, fmtRange, ymd } from "@/lib/days";
import { localDay } from "@/lib/format";
import { blockedBetween, daysOffBetween } from "@/lib/holidays";
import { managedPeople, waitingRequests } from "@/lib/hr";
import { balancesFor, canDecide, countDays } from "@/lib/time-off";

function Section({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-border first:border-t-0">
      <div className="px-4 pb-2 pt-4">
        <h2 className="font-semibold">{title}</h2>
        {sub && <p className="text-xs text-muted">{sub}</p>}
      </div>
      {children}
    </section>
  );
}

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
  const [balances, rows, daysOff, blocked] = await Promise.all([
    balancesFor(ids, year, today),
    ids.length
      ? db
          .select()
          .from(schema.timeOff)
          .where(
            and(
              inArray(schema.timeOff.userId, ids),
              ne(schema.timeOff.status, "pending"),
              gte(schema.timeOff.endDate, addDays(today, -60)),
            ),
          )
          .orderBy(desc(schema.timeOff.startDate))
      : [],
    daysOffBetween(ymd(year - 1, 1, 1), ymd(year + 1, 12, 31)),
    blockedBetween(today, ymd(year + 1, 12, 31)),
  ]);
  const name = new Map(everyone.map((p) => [p.id, p.name]));
  const byId = new Map(everyone.map((p) => [p.id, p]));
  // For changing someone's time off from the list at the bottom.
  const form = {
    me: { id: auth.user.id, name: auth.user.name },
    people: [],
    daysOff: [...daysOff],
    vacationLeft: 0,
    selfApproves: admin,
    blocked: blocked.map(({ startDate, endDate, reason }) => ({ startDate, endDate, reason })),
  };

  return (
    <HrTabs
      auth={auth}
      active="requests"
    >
      <Section title="Waiting for you" sub={waiting.length ? "Oldest first." : undefined}>
        <DataGrid
          flush
          empty="Nothing to approve right now."
          headers={["Person", "Dates", "Kind", { label: "Days", align: "right" }, "Note", "Asked"]}
          rows={waiting.map(({ request: t, person }) => ({
            key: t.id,
            cells: [
              <span key="p" className="flex items-center gap-2 font-medium">
                <Avatar name={person.name} size="sm" />
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
                {t.note}
                {t.kind === "vacation" && balances.get(person.id) && (
                  <span className="block text-xs">
                    {fmtNum(balances.get(person.id)!.left)} vacation days left before this
                  </span>
                )}
              </span>,
              <span key="a" className="whitespace-nowrap text-xs text-muted">
                {fmtLongDay(localDay(t.createdAt, config.timeZone))}
              </span>,
            ],
            actions: <DecideButtons id={t.id} name={person.name} />,
          }))}
        />
      </Section>

      <TimeOffFormProvider value={form}>
      <Section title="Time off" sub="Approved, recorded (sick leave), rejected and cancelled, from the last 60 days on.">
        <DataGrid
          flush
          empty="No time off yet."
          headers={["Person", "Dates", "Kind", { label: "Days", align: "right" }, "Status"]}
          rows={rows.map((t) => ({
            key: t.id,
            sort: [name.get(t.userId), t.startDate, t.kind, null, t.status],
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
            ],
            actions:
              t.status === "approved" && canDecide(auth, byId.get(t.userId) ?? { id: t.userId, teamId: null }) ? (
                <span className="flex items-center">
                  <ChangeTimeOffButton t={{ ...t, name: name.get(t.userId) ?? "" }} />
                  <CancelTimeOffButton id={t.id} />
                </span>
              ) : undefined,
          }))}
        />
      </Section>
      </TimeOffFormProvider>
    </HrTabs>
  );
}

export default function RequestsPage() {
  return (
    <div className="space-y-6">
      <h1 className="sr-only">Requests</h1>
      <HrSuspense>
        <RequestsContent />
      </HrSuspense>
    </div>
  );
}
