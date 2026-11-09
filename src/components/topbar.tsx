"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const SECTIONS: Record<string, string> = {
  dashboard: "Dashboard",
  tasks: "Tasks",
  critical: "Critical",
  recurring: "Recurring",
  leads: "Leads",
  clients: "Clients",
  reports: "Reports",
  team: "Team",
};
const DETAIL: Record<string, string> = { tasks: "Task", clients: "Client", leads: "Lead", recurring: "Series", team: "Team" };

/** Where you are: Home › Tasks › Task #12. Detail pages are named by kind and id. */
function Breadcrumb() {
  const parts = usePathname().split("/").filter(Boolean);
  const crumbs: { label: string; href?: string }[] = [{ label: "Home", href: "/dashboard" }];
  if (parts[0]) {
    const section = SECTIONS[parts[0]] ?? parts[0];
    crumbs.push({ label: section, href: parts[1] ? `/${parts[0]}` : undefined });
    if (parts[1]) crumbs.push({ label: `${DETAIL[parts[0]] ?? "Item"} #${parts[1]}` });
  }
  // On the dashboard itself "Home › Dashboard" says the same thing twice.
  const shown = parts[0] === "dashboard" ? crumbs.slice(1) : crumbs;
  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex items-center gap-1.5 truncate text-sm text-muted">
        {shown.map((c, i) => (
          <li key={i} className="flex items-center gap-1.5">
            {i > 0 && <span aria-hidden>›</span>}
            {c.href ? (
              <Link href={c.href} className="transition-colors hover:text-foreground hover:underline">
                {c.label}
              </Link>
            ) : (
              <span aria-current="page" className="font-medium text-foreground">
                {c.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** The bar across the top of the page: the breadcrumb on the left, live status (passed in) on the right. */
export function Topbar({ children }: { children: ReactNode }) {
  if (usePathname() === "/login") return null;
  return (
    <header className="sticky top-0 z-30 flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border bg-surface/90 px-4 py-2 backdrop-blur">
      <Breadcrumb />
      <div className="ml-auto flex flex-wrap items-center gap-2">{children}</div>
    </header>
  );
}
