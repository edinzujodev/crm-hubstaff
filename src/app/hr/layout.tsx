import { Suspense } from "react";
import { connection } from "next/server";
import { HrNavLinks, type HrNavGroup } from "@/components/hr-nav";
import { canUseHr, getAuth } from "@/lib/auth";
import { waitingRequests } from "@/lib/hr";

/**
 * HR is for super admins and team leaders. Planning: the calendar and who is away. Manage: requests and vacation
 * balances. Organisation: people and teams. Settings: holidays.
 */
async function HrNav() {
  await connection();
  const auth = await getAuth();
  // The pages send everyone else away; without access there is no menu to show.
  if (!auth || !canUseHr(auth)) return null;
  const waiting = (await waitingRequests(auth)).length;
  const groups: HrNavGroup[] = [
    {
      title: "Planning",
      items: [
        { href: "/hr", label: "Calendar", icon: "pi-calendar" },
        { href: "/hr/time-off", label: "Time off", icon: "pi-table" },
      ],
    },
    {
      title: "Manage",
      items: [
        { href: "/hr/requests", label: "Requests", icon: "pi-inbox", count: waiting },
        { href: "/hr/balances", label: "Balances", icon: "pi-chart-bar" },
      ],
    },
    {
      title: "Organisation",
      items: [
        { href: "/hr/people", label: "People", icon: "pi-users" },
        { href: "/hr/teams", label: auth.role === "super_admin" ? "Teams" : "Your team", icon: "pi-sitemap" },
      ],
    },
    {
      title: "Settings",
      items: [{ href: "/hr/holidays", label: "Holidays", icon: "pi-star" }],
    },
  ];
  return <HrNavLinks groups={groups} />;
}

function NavSkeleton() {
  return (
    <div className="flex gap-2 md:flex-col" aria-hidden>
      {[0, 1, 2].map((i) => (
        <span key={i} className="h-9 w-28 animate-pulse rounded-md bg-foreground/5 md:w-full" />
      ))}
    </div>
  );
}

export default function HrLayout({ children }: LayoutProps<"/hr">) {
  return (
    <div className="flex flex-col gap-5 md:flex-row md:items-start">
      <aside className="md:sticky md:top-16 md:w-44 md:shrink-0">
        <Suspense fallback={<NavSkeleton />}>
          <HrNav />
        </Suspense>
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
