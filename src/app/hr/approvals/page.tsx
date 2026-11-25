import { and, desc, eq, gte, inArray, ne } from "drizzle-orm";
import { connection } from "next/server";
import { db, schema } from "@/db";
import { AllowanceButton } from "@/components/allowance-button";
import { Avatar } from "@/components/avatar";
import { fmtNum } from "@/components/balance-tiles";
import { DataGrid } from "@/components/data-grid";
import { HrSuspense, HrTabs } from "@/components/hr-tabs";
import { CancelTimeOffButton, DecideButtons, KindBadge, StatusBadge } from "@/components/time-off";
import { pageGuard } from "@/lib/auth";
import { config } from "@/lib/config";
import { addDays, fmtLongDay, fmtRange, ymd } from "@/lib/days";
import { localDay } from "@/lib/format";
import { daysOffBetween } from "@/lib/holidays";
import { managedPeople, waitingRequests } from "@/lib/hr";
import { balancesFor, countDays } from "@/lib/time-off";

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
 * For team leaders and super admins: requests waiting for a decision, everyone's vacation days, and the time off of
 * the people they look after.
 */
async function ApprovalsContent() {
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
  const [balances, rows, allowanceRows, daysOff] = await Promise.all([
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
    admin ? db.select().from(schema.leaveAllowances).where(eq(schema.leaveAllowances.year, year)) : [],
    daysOffBetween(ymd(year - 1, 1, 1), ymd(year + 1, 12, 31)),
  ]);
  const name = new Map(everyone.map((p) => [p.id, p.name]));
  const sorted = [...everyone].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <HrTabs
      auth={auth}
      active="approvals"
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

      <Section title={`Vacation days in ${year}`} sub={admin ? "Change someone's days with the pencil." : "Set by a super admin."}>
        <DataGrid
          flush
          empty="Nobody in your teams yet."
          headers={[
            "Person",
            { label: "Allowance", align: "right" },
            { label: "Carried over", align: "right" },
            { label: "Taken", align: "right" },
            { label: "Waiting", align: "right" },
            { label: "Left", align: "right" },
          ]}
          rows={sorted.map((p) => {
            const b = balances.get(p.id)!;
            const row = allowanceRows.find((r) => r.userId === p.id);
            return {
              key: p.id,
              cells: [
                <span key="p" className="flex items-center gap-2 font-medium">
                  <Avatar name={p.name} size="sm" />
                  {p.name}
                </span>,
                <span key="a" className="font-mono tabular-nums" title={b.custom.days ? "Set by hand for this year" : undefined}>
                  {fmtNum(b.allowance)}
                  {b.custom.days && "*"}
                </span>,
                <span key="c" className="font-mono tabular-nums" title={b.expired ? `${fmtNum(b.expired)} expired` : undefined}>
                  {fmtNum(b.carriedOver)}
                  {b.custom.carriedOver && "*"}
                  {b.expired > 0 && <span className="text-muted"> (−{fmtNum(b.expired)})</span>}
                </span>,
                <span key="u" className="font-mono tabular-nums">
                  {fmtNum(b.used)}
                </span>,
                <span key="w" className="font-mono tabular-nums">
                  {b.pending ? fmtNum(b.pending) : "—"}
                </span>,
                <span key="l" className={`font-mono font-semibold tabular-nums ${b.left < 0 ? "text-red-600" : ""}`}>
                  {fmtNum(b.left)}
                </span>,
              ],
              actions: admin ? (
                <AllowanceButton
                  data={{
                    userId: p.id,
                    name: p.name,
                    year,
                    annual: p.annual ?? b.allowance,
                    days: row?.days ?? null,
                    carriedOver: row?.carriedOver ?? null,
                    carryOverUntil: row?.carryOverUntil ?? null,
                    computedCarry: b.carryWorkedOut,
                  }}
                />
              ) : undefined,
            };
          })}
        />
      </Section>

      <Section title="Time off" sub="Approved, rejected and cancelled, from the last 60 days on.">
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
              <StatusBadge key="s" status={t.status} />,
            ],
            actions:
              t.status === "approved" && t.userId !== auth.user.id ? <CancelTimeOffButton id={t.id} /> : undefined,
          }))}
        />
      </Section>
    </HrTabs>
  );
}

export default function ApprovalsPage() {
  return (
    <div className="space-y-6">
      <h1 className="sr-only">Approvals</h1>
      <HrSuspense>
        <ApprovalsContent />
      </HrSuspense>
    </div>
  );
}
