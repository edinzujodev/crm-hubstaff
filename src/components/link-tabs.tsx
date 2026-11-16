"use client";

import { useRouter } from "next/navigation";
import { TabMenu } from "primereact/tabmenu";

/** Page-level tabs that are links: the active one is passed in, picking another goes to its address. */
export function LinkTabs({ tabs, active }: { tabs: { label: string; href: string }[]; active: number }) {
  const router = useRouter();
  return (
    <TabMenu
      model={tabs.map((t) => ({ label: t.label }))}
      activeIndex={active}
      onTabChange={(e) => router.push(tabs[e.index].href)}
    />
  );
}
