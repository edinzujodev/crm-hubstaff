import { Suspense } from "react";
import { TableSkeleton } from "@/components/page-skeleton";
import type { Auth } from "@/lib/auth";

export type HrTab = "calendar" | "vacations" | "approvals" | "people" | "teams" | "holidays";

const TITLES: Record<HrTab, string> = {
  calendar: "Calendar",
  vacations: "Vacations",
  approvals: "Approvals",
  people: "People",
  teams: "Teams",
  holidays: "Holidays",
};

/**
 * The box around an HR page: its title on the left; the page's filters (`toolbar`) and buttons (`actions`) on the
 * right of the same row. Every HR page's box starts at the same height, so switching pages in the HR menu on the
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
      <HrBoxHeader title={title}>
        {toolbar}
        {actions}
      </HrBoxHeader>
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

type Actions = string[] | ((auth: Auth) => string[] | undefined);

/** The loading state of an HR page: the same box, so nothing moves when the page arrives. */
export function HrSuspense({ rows = 6, children }: { actions?: Actions; rows?: number; children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="card overflow-hidden" role="status" aria-label="Loading">
          <HrBoxHeader title={<span className="block h-5 w-28 animate-pulse rounded bg-foreground/10" />}>
            <span className="block h-9 w-36 animate-pulse rounded-md bg-foreground/10" />
          </HrBoxHeader>
          <TableSkeleton rows={rows} />
        </div>
      }
    >
      {children}
    </Suspense>
  );
}
