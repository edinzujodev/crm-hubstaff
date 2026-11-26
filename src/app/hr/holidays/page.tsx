import Link from "next/link";
import { and, eq, gte, lte } from "drizzle-orm";
import { connection } from "next/server";
import { db, schema } from "@/db";
import { DataGrid } from "@/components/data-grid";
import { AddHolidayButton, EditHolidayButton, HolidayButton } from "@/components/holiday-actions";
import { HrSuspense, HrTabs } from "@/components/hr-tabs";
import { HR_ROLES, pageGuard } from "@/lib/auth";
import { config } from "@/lib/config";
import { fmtLongDay, fmtShortDay, isWeekend, ymd } from "@/lib/days";
import { localDay } from "@/lib/format";
import { holidaysBetween } from "@/lib/holidays";

function YearSwitch({ year }: { year: number }) {
  const link = "flex h-8 w-8 items-center justify-center rounded-md hover:bg-foreground/5";
  return (
    <span className="flex items-center gap-1 text-sm font-medium">
      <Link href={`/hr/holidays?year=${year - 1}`} className={link} aria-label={`Holidays in ${year - 1}`}>
        <i className="pi pi-chevron-left text-xs" aria-hidden />
      </Link>
      <span className="w-12 text-center font-mono tabular-nums">{year}</span>
      <Link href={`/hr/holidays?year=${year + 1}`} className={link} aria-label={`Holidays in ${year + 1}`}>
        <i className="pi pi-chevron-right text-xs" aria-hidden />
      </Link>
    </span>
  );
}

/** Public holidays (days off for everyone) and religious holidays (on the calendar, booked per person). */
async function HolidaysContent({ wanted }: { wanted: Promise<string | undefined> }) {
  await connection();
  const auth = await pageGuard(...HR_ROLES);
  const admin = auth.role === "super_admin";
  const current = Number(localDay(new Date(), config.timeZone).slice(0, 4));
  const asked = Number(await wanted);
  const year = Number.isInteger(asked) && asked >= 2000 && asked <= 2100 ? asked : current;
  const [from, to] = [ymd(year, 1, 1), ymd(year, 12, 31)];
  const [list, hidden] = await Promise.all([
    holidaysBetween(from, to),
    admin
      ? db
          .select()
          .from(schema.holidays)
          .where(and(eq(schema.holidays.source, "hidden"), gte(schema.holidays.date, from), lte(schema.holidays.date, to)))
      : [],
  ]);

  return (
    <HrTabs
      auth={auth}
      active="holidays"
      actions={admin ? <AddHolidayButton /> : undefined}
    >
      <DataGrid
        flush
        alwaysSearch
        // The year sits on the search row, so there is one line of filters.
        toolbar={<YearSwitch year={year} />}
        empty={`No holidays in ${year}.`}
        headers={["Date", "Holiday", "Type", "Source"]}
        rows={list.map((h) => ({
          key: `${h.date}-${h.name}`,
          sort: [h.date, h.name, h.dayOff ? 0 : 1, h.source],
          cells: [
            <span key="d" className="whitespace-nowrap">
              {fmtShortDay(h.date)}
              {h.dayOff && isWeekend(h.date) && <span className="text-xs text-muted"> · weekend</span>}
            </span>,
            admin ? (
              <EditHolidayButton key="n" holiday={{ date: h.date, name: h.name, dayOff: h.dayOff, source: h.source, id: h.id }} />
            ) : (
              <span key="n" className="font-medium">
                {h.name}
              </span>
            ),
            h.dayOff ? (
              <span key="t" className="inline-flex rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:text-emerald-300">
                Day off for everyone
              </span>
            ) : (
              <span key="t" className="inline-flex rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-300" title="Book it as a religious holiday under Time off">
                Religious, booked per person
              </span>
            ),
            <span key="s" className="text-xs text-muted">
              {h.source === "built-in" ? "Built in" : "Added"}
            </span>,
          ],
          actions: admin ? (
            h.source === "custom" ? (
              <HolidayButton action={{ kind: "delete", id: h.id! }} label="Delete" done="Holiday deleted" confirmText={`Delete ${h.name}?`} />
            ) : (
              <HolidayButton
                action={{ kind: "hide", date: h.date, name: h.name }}
                label="Remove"
                done={`${h.name} removed for ${year}`}
                confirmText={`Remove ${h.name} from ${year}?`}
              />
            )
          ) : undefined,
        }))}
      />
      {hidden.length > 0 && (
        <div className="space-y-2 border-t border-border p-4">
          <p className="text-xs font-medium text-muted">Built-in holidays removed for {year}</p>
          <ul className="space-y-1 text-sm">
            {hidden.map((h) => (
              <li key={h.id} className="flex items-center justify-between gap-3">
                <span>
                  {h.name} <span className="text-muted">· {fmtLongDay(h.date)}</span>
                </span>
                <HolidayButton action={{ kind: "delete", id: h.id }} label="Restore" done={`${h.name} is back`} />
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="border-t border-border px-4 py-3 text-xs text-muted">
        Built in: the public holidays of the Federation of BiH and the main religious holidays. Bajram dates are the
        expected ones; correct them here if the Islamic Community announces another day.
      </p>
    </HrTabs>
  );
}

export default function HolidaysPage({ searchParams }: PageProps<"/hr/holidays">) {
  const wanted = searchParams.then((p) => (typeof p.year === "string" ? p.year : undefined));
  return (
    <div className="space-y-6">
      <h1 className="sr-only">Holidays</h1>
      <HrSuspense actions={(a) => (a.role === "super_admin" ? ["Add holiday"] : undefined)}>
        <HolidaysContent wanted={wanted} />
      </HrSuspense>
    </div>
  );
}
