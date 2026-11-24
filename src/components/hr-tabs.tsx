import { TabCard } from "@/components/tab-card";
import type { LinkTab } from "@/components/link-tabs";
import type { Auth } from "@/lib/auth";
import { waitingRequests } from "@/lib/hr";

export type HrTab = "calendar" | "time-off" | "approvals" | "people" | "teams" | "holidays";

/**
 * The HR section's tabs around a page. Everyone has the calendar, their own time off and the holidays; team
 * leaders and super admins also approve requests and look after people and teams.
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
  const manager = auth.role === "super_admin" || auth.role === "leader";
  const waiting = manager ? (await waitingRequests(auth)).length : 0;
  const tabs: (LinkTab & { key: HrTab })[] = [
    { key: "calendar", label: "Calendar", href: "/hr" },
    { key: "time-off", label: "Time off", href: "/hr/time-off" },
    ...(manager
      ? [
          { key: "approvals" as const, label: "Approvals", href: "/hr/approvals", count: waiting || undefined, alarm: waiting > 0 },
          { key: "people" as const, label: "People", href: "/hr/people" },
          { key: "teams" as const, label: auth.role === "super_admin" ? "Teams" : "Your team", href: "/hr/teams" },
        ]
      : []),
    { key: "holidays", label: "Holidays", href: "/hr/holidays", end: true },
  ];
  return (
    <TabCard tabs={tabs} active={Math.max(0, tabs.findIndex((t) => t.key === active))} actions={actions} toolbar={toolbar} padded={padded}>
      {children}
    </TabCard>
  );
}
