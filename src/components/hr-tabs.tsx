import { Suspense } from "react";
import { ListSkeleton } from "@/components/page-skeleton";
import { getAuth, type Auth } from "@/lib/auth";

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
 * The box around an HR page: its title with the page's filters (`toolbar`) on the right, and the page's buttons
 * (`actions`) above it. The HR menu on the left (app/hr/layout.tsx) moves between the pages.
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
    <div className="space-y-3">
      {actions && <div className="flex flex-wrap items-center justify-end gap-2">{actions}</div>}
      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border px-4 py-3">
          <h2 className="text-base font-semibold">{title}</h2>
          {toolbar && <div className="flex flex-wrap items-center justify-end gap-2">{toolbar}</div>}
        </div>
        <div className={padded ? "p-4" : undefined}>{children}</div>
      </div>
    </div>
  );
}

type Actions = string[] | ((auth: Auth) => string[] | undefined);

/**
 * The loading state of an HR page. `actions` are the labels of the buttons the page shows above its box, so the
 * skeleton keeps room for them and the page doesn't jump down when it loads. When the buttons depend on the
 * person's role, pass a function: the skeleton then waits for the (cached, quick) sign-in check to pick them.
 */
export function HrSuspense({ actions, rows, children }: { actions?: Actions; rows?: number; children: React.ReactNode }) {
  if (typeof actions !== "function") {
    return <Suspense fallback={<ListSkeleton rows={rows} actions={actions} />}>{children}</Suspense>;
  }
  return (
    <Suspense fallback={<ListSkeleton rows={rows} />}>
      <RoleSkeleton actions={actions} rows={rows}>
        {children}
      </RoleSkeleton>
    </Suspense>
  );
}

async function RoleSkeleton({ actions, rows, children }: { actions: (auth: Auth) => string[] | undefined; rows?: number; children: React.ReactNode }) {
  const auth = await getAuth();
  return <Suspense fallback={<ListSkeleton rows={rows} actions={auth ? actions(auth) : undefined} />}>{children}</Suspense>;
}
