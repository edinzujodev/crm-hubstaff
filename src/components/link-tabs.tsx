"use client";

import { useRouter } from "next/navigation";
import { TabMenu } from "primereact/tabmenu";
import { ProgressBar } from "primereact/progressbar";
import { useState, useTransition } from "react";

export type LinkTab = { label: string; href: string; count?: number; alarm?: boolean };

/**
 * Page-level tabs that are links. The tab you pick turns active right away, a thin bar runs under the tabs while
 * the page for it loads.
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
          startNavigation(() => router.push(tabs[e.index].href));
        }}
      />
      {loading && (
        <ProgressBar
          mode="indeterminate"
          aria-label="Loading"
          className="absolute inset-x-0 bottom-0"
          style={{ height: "3px" }}
        />
      )}
    </div>
  );
}
