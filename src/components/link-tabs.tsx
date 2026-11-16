"use client";

import { useRouter } from "next/navigation";
import { TabMenu } from "primereact/tabmenu";

export type LinkTab = { label: string; href: string; count?: number; alarm?: boolean };

/** Page-level tabs that are links: the active one is passed in, picking another goes to its address. */
export function LinkTabs({ tabs, active }: { tabs: LinkTab[]; active: number }) {
  const router = useRouter();
  return (
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
              router.push(t.href);
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
      activeIndex={active}
    />
  );
}
