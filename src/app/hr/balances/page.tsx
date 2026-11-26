import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { connection } from "next/server";
import { db, schema } from "@/db";
import { AllowanceButton } from "@/components/allowance-button";
import { Avatar } from "@/components/avatar";
import { fmtNum } from "@/components/balance-tiles";
import { DataGrid } from "@/components/data-grid";
import { HrSuspense, HrTabs } from "@/components/hr-tabs";
import { pageGuard } from "@/lib/auth";
import { config } from "@/lib/config";
import { ymd } from "@/lib/days";
import { localDay } from "@/lib/format";
import { daysOffBetween } from "@/lib/holidays";
import { managedPeople } from "@/lib/hr";
import { balancesFor, countDays } from "@/lib/time-off";

/**
 * Vacation days per person this year: allowance, carried over, taken, waiting and left, and next to them the sick
 * leave recorded this year. A super admin sees everyone and sets their days; a team leader sees the people they look
 * after.
 */
async function BalancesContent() {
  await connection();
  const auth = await pageGuard("super_admin", "leader");
  const admin = auth.role === "super_admin";
  const today = localDay(new Date(), config.timeZone);
  const year = Number(today.slice(0, 4));
  // A super admin also sees (and sets) their own days here.
  const everyone = admin
    ? await db
        .select({ id: schema.users.id, name: schema.users.name, teamId: schema.users.teamId, annual: schema.users.annualLeaveDays })
        .from(schema.users)
    : (await managedPeople(auth)).map((p) => ({ ...p, annual: null }));
  const ids = everyone.map((p) => p.id);
  const [yearStart, yearEnd] = [ymd(year, 1, 1), ymd(year, 12, 31)];
  const [balances, allowanceRows, sickRows, daysOff] = await Promise.all([
    balancesFor(ids, year, today),
    admin ? db.select().from(schema.leaveAllowances).where(eq(schema.leaveAllowances.year, year)) : [],
    ids.length
      ? db
          .select({ userId: schema.timeOff.userId, startDate: schema.timeOff.startDate, endDate: schema.timeOff.endDate, halfDay: schema.timeOff.halfDay })
          .from(schema.timeOff)
          .where(
            and(
              inArray(schema.timeOff.userId, ids),
              eq(schema.timeOff.kind, "sick"),
              eq(schema.timeOff.status, "approved"),
              lte(schema.timeOff.startDate, yearEnd),
              gte(schema.timeOff.endDate, yearStart),
            ),
          )
      : [],
    daysOffBetween(yearStart, yearEnd),
  ]);
  // Sick days recorded this year (working days only; it never comes off the vacation days).
  const sick = new Map<number, number>();
  for (const t of sickRows) sick.set(t.userId, (sick.get(t.userId) ?? 0) + countDays(t, daysOff, yearStart, yearEnd));
  const sorted = [...everyone].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <HrTabs auth={auth} active="balances">
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
          { label: "Sick leave", align: "right" },
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
              <span key="s" className={`font-mono tabular-nums ${sick.get(p.id) ? "text-rose-600 dark:text-rose-400" : "text-muted"}`}>
                {sick.get(p.id) ? fmtNum(sick.get(p.id)!) : "—"}
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
    </HrTabs>
  );
}

export default function BalancesPage() {
  return (
    <div className="space-y-6">
      <h1 className="sr-only">Balances</h1>
      <HrSuspense>
        <BalancesContent />
      </HrSuspense>
    </div>
  );
}
