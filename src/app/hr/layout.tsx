import { Suspense } from "react";
import { connection } from "next/server";
import { HrNavLinks, type HrNavGroup } from "@/components/hr-nav";
import { getAuth } from "@/lib/auth";
import { waitingRequests } from "@/lib/hr";

/** Everyone plans with the calendar, vacations and holidays; team leaders and super admins also manage. */
async function HrNav() {
  await connection();
  const auth = await getAuth();
  if (!auth) return null;
  const manager = auth.role === "super_admin" || auth.role === "leader";
  const waiting = manager ? (await waitingRequests(auth)).length : 0;
  const groups: HrNavGroup[] = [
    {
      title: "Planning",
      items: [
        { href: "/hr", label: "Calendar", icon: "pi-calendar" },
        { href: "/hr/vacations", label: "Vacations", icon: "pi-table" },
        { href: "/hr/holidays", label: "Holidays", icon: "pi-star" },
      ],
    },
  ];
  if (manager) {
    groups.push({
      title: "Manage",
      items: [
        { href: "/hr/approvals", label: "Approvals", icon: "pi-check-circle", count: waiting },
        { href: "/hr/people", label: "People", icon: "pi-users" },
        { href: "/hr/teams", label: auth.role === "super_admin" ? "Teams" : "Your team", icon: "pi-sitemap" },
      ],
    });
  }
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
      <aside className="md:sticky md:top-20 md:w-44 md:shrink-0">
        <Suspense fallback={<NavSkeleton />}>
          <HrNav />
        </Suspense>
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
