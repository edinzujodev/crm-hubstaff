"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * The person's button at the bottom of the sidebar. It opens a panel above it with their details, the Hubstaff sync and
 * Sign out. The panel is hidden, not removed, when closed, so the background sync inside it keeps running.
 */
export function ProfileMenu({
  name,
  email,
  role,
  children,
}: {
  name: string;
  email: string;
  role: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

  return (
    <div ref={root} className="relative w-full">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full cursor-pointer items-center gap-2 rounded-full border border-border py-1 pl-1 pr-3 text-sm transition-colors duration-200 hover:bg-primary/10"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-(--primary-fg)">
          {initials}
        </span>
        <span className="min-w-0 flex-1 truncate text-left font-medium">{name}</span>
        <span aria-hidden className="text-xs text-muted">
          {open ? "▴" : "▾"}
        </span>
      </button>

      <div
        hidden={!open}
        role="dialog"
        aria-label="Your profile"
        className="card absolute left-0 top-full z-40 mt-2 w-80 md:bottom-full md:top-auto md:mb-2 md:mt-0 max-w-[calc(100vw-2rem)] space-y-4 p-4 shadow-lg"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary font-semibold text-(--primary-fg)">
            {initials}
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium">{name}</p>
            <p className="truncate text-xs text-muted">{email}</p>
            <span className="badge mt-1">{role}</span>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
