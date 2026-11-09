"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * A sidebar link. On hover the row tints, a bar grows in on its left edge and the label slides a little to
 * the right; the current page keeps the bar and the tint. Motion is skipped for people who ask for less.
 */
export function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const path = usePathname();
  const active = path === href || path.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`group relative flex items-center overflow-hidden rounded-md px-3 py-2 text-sm transition-colors duration-200 hover:bg-primary/10 focus-visible:bg-primary/10 ${
        active ? "bg-primary/10 font-semibold" : "text-foreground/80 hover:text-foreground"
      }`}
    >
      <span
        aria-hidden
        className={`absolute inset-y-1.5 left-0 w-1 origin-center rounded-r bg-primary transition-transform duration-200 motion-reduce:transition-none ${
          active ? "scale-y-100" : "scale-y-0 group-hover:scale-y-100 group-focus-visible:scale-y-100"
        }`}
      />
      <span className="transition-transform duration-200 ease-out group-hover:translate-x-1.5 group-focus-visible:translate-x-1.5 motion-reduce:transform-none motion-reduce:transition-none">
        {children}
      </span>
    </Link>
  );
}
