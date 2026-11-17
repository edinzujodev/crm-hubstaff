"use client";

import { useRouter } from "next/navigation";
import { TabMenu } from "primereact/tabmenu";
import { useState, useTransition } from "react";

/** A small icon in front of a tab name, picked by the name. */
const ICONS: Record<string, string> = {
  Open: "pi-inbox",
  "On review": "pi-eye",
  Critical: "pi-exclamation-triangle",
  Recurring: "pi-refresh",
  Finished: "pi-check-circle",
  Deleted: "pi-trash",
  All: "pi-list",
  Companies: "pi-building",
  Groups: "pi-sitemap",
  Won: "pi-trophy",
  Lost: "pi-times-circle",
  People: "pi-users",
  Teams: "pi-sitemap",
  "Your team": "pi-sitemap",
  Checklist: "pi-check-square",
  Time: "pi-clock",
  Occurrences: "pi-history",
  Reviews: "pi-verified",
  Blocked: "pi-ban",
  Templates: "pi-clone",
  "Urgency levels": "pi-bell",
};

export type LinkTab = { label: string; href: string; count?: number; alarm?: boolean };

/**
 * Page-level tabs that are links. The tab you pick turns active right away, and a small spinner turns in front
 * of its name while its page loads. Switching tabs replaces the history entry, so Back leaves the page instead of
 * stepping through the tabs you opened.
 */
export function LinkTabs({ tabs, active }: { tabs: LinkTab[]; active: number }) {
  const router = useRouter();
  const [loading, startNavigation] = useTransition();
  const [current, setCurrent] = useState(active);
  // The page tells us which tab it is on once it has loaded (also after Back / Forward).
  const [seen, setSeen] = useState(active);
  if (seen !== active) {
    setSeen(active);
    setCurrent(active);
  }

  return (
    <div className="relative" aria-busy={loading}>
      <TabMenu
        model={tabs.map((t) => ({
          label: t.label,
          template: (item, options) => (
            <a
              role="menuitem"
              href={t.href}
              className={options.className}
              onClick={(e) => {
                e.preventDefault();
                options.onClick(e);
              }}
            >
              {loading && tabs[current]?.href === t.href && (
                <i aria-hidden className="pi pi-spin pi-spinner mr-2 text-xs" />
              )}
              {!(loading && tabs[current]?.href === t.href) && ICONS[t.label] && (
                <i aria-hidden className={`pi ${ICONS[t.label]} mr-2 text-sm`} />
              )}
              <span className={options.labelClassName}>{item.label}</span>
              {t.count !== undefined && (
                <span
                  className={`ml-1.5 font-mono text-xs tabular-nums ${t.alarm ? "font-semibold text-red-600 dark:text-red-400" : "opacity-70"}`}
                >
                  {t.count}
                </span>
              )}
            </a>
          ),
        }))}
        activeIndex={current}
        onTabChange={(e) => {
          setCurrent(e.index);
          startNavigation(() => router.replace(tabs[e.index].href));
        }}
      />
    </div>
  );
}
