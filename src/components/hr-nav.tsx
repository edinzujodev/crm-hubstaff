"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type HrNavItem = { href: string; label: string; icon: string; count?: number };
export type HrNavGroup = { title: string; items: HrNavItem[] };

/** The HR section's own menu: a column on the left on larger screens, a scrolling row on phones. */
export function HrNavLinks({ groups }: { groups: HrNavGroup[] }) {
  const path = usePathname();
  const active = (href: string) => (href === "/hr" ? path === "/hr" : path === href || path.startsWith(`${href}/`));
  return (
    <nav aria-label="HR" className="flex gap-1 overflow-x-auto [scrollbar-width:none] md:flex-col md:gap-5 md:overflow-visible">
      {groups.map((g) => (
        <div key={g.title} className="flex shrink-0 gap-1 md:flex-col">
          <p className="hidden px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted md:block">{g.title}</p>
          {g.items.map((i) => {
            const on = active(i.href);
            return (
              <Link
                key={i.href}
                href={i.href}
                aria-current={on ? "page" : undefined}
                className={`flex items-center gap-2.5 whitespace-nowrap rounded-md px-3 py-2 text-sm transition-colors ${
                  on ? "bg-surface font-semibold shadow-sm ring-1 ring-border" : "text-foreground/75 hover:bg-foreground/5 hover:text-foreground"
                }`}
              >
                <i className={`pi ${i.icon} w-4 text-center text-sm ${on ? "" : "text-muted"}`} aria-hidden />
                {i.label}
                {i.count ? (
                  <span className="ml-auto rounded-full bg-red-500 px-1.5 text-[11px] font-semibold leading-5 text-white tabular-nums">{i.count}</span>
                ) : null}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
