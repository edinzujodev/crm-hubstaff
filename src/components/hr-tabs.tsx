import { Suspense } from "react";
import { TableSkeleton } from "@/components/page-skeleton";
import type { Auth } from "@/lib/auth";

export type HrTab = "calendar" | "time-off" | "requests" | "balances" | "people" | "teams" | "holidays";

const TITLES: Record<HrTab, string> = {
  calendar: "Calendar",
  "time-off": "Time off",
  requests: "Requests",
  balances: "Balances",
  people: "People",
  teams: "Teams",
  holidays: "Holidays",
};

/**
 * The box around an HR page: its title on the left and its buttons (`actions`) on the right; the page's filters
 * (`toolbar`) get their own row under the line, so the title row never gets crowded. Every HR page's box starts at the same height, so switching pages in the HR menu on the
 * left (app/hr/layout.tsx) doesn't make the page jump.
 */
export async function HrTabs({
  auth,
  active,
  actions,
  toolbar,
  padded,
  children,
}: {
  auth: Auth;
  active: HrTab;
  actions?: React.ReactNode;
  toolbar?: React.ReactNode;
  padded?: boolean;
  children: React.ReactNode;
}) {
  const title = active === "teams" && auth.role !== "super_admin" ? "Your team" : TITLES[active];
  return (
    <div className="card overflow-hidden">
      <HrBoxHeader title={title}>{actions}</HrBoxHeader>
      {toolbar && <HrFilterRow>{toolbar}</HrFilterRow>}
      <div className={padded ? "p-4" : undefined}>{children}</div>
    </div>
  );
}

function HrBoxHeader({ title, children }: { title: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="flex min-h-16 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border px-4 py-3">
      <h2 className="text-base font-semibold">{title}</h2>
      <div className="flex flex-wrap items-center justify-end gap-2">{children}</div>
    </div>
  );
}

/** The filters of an HR page, in a row of their own under the title. With two groups, the first sits left and the last right. */
function HrFilterRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-13 flex-wrap items-center justify-between gap-2 border-b border-border bg-foreground/[0.02] px-4 py-2">
      {children}
    </div>
  );
}

type Actions = string[] | ((auth: Auth) => string[] | undefined);

/** The loading state of an HR page: the same box, so nothing moves when the page arrives. */
export function HrSuspense({
  rows = 6,
  toolbar,
  children,
}: {
  actions?: Actions;
  /** The page has a filter row, so the loading box keeps room for it. */
  toolbar?: boolean;
  rows?: number;
  children: React.ReactNode;
}) {
  return (
    <Suspense
      fallback={
        <div className="card overflow-hidden" role="status" aria-label="Loading">
          <HrBoxHeader title={<span className="block h-5 w-28 animate-pulse rounded bg-foreground/10" />}>
            <span className="block h-9 w-36 animate-pulse rounded-md bg-foreground/10" />
          </HrBoxHeader>
          {toolbar && (
            <HrFilterRow>
              <span className="block h-8 w-48 animate-pulse rounded-md bg-foreground/10" />
            </HrFilterRow>
          )}
          <TableSkeleton rows={rows} />
        </div>
      }
    >
      {children}
    </Suspense>
  );
}
