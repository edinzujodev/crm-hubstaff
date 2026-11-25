"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LONG = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

/**
 * The month's name as a button that opens a year with its twelve months, to jump straight to any month instead of
 * clicking through them one at a time. `href` builds the link for a yyyy-mm month.
 */
export function MonthPicker({ month, current, base, team }: { month: string; current: string; base: string; team: boolean }) {
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(Number(month.slice(0, 4)));
  const root = useRef<HTMLDivElement>(null);
  const href = (m: string) => `${base}?m=${m}${team ? "&who=team" : ""}`;

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

  const toggle = () => {
    // Always open on the year being shown.
    if (!open) setYear(Number(month.slice(0, 4)));
    setOpen(!open);
  };

  const step = "flex h-7 w-7 cursor-pointer items-center justify-center rounded-md hover:bg-foreground/5";
  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="flex min-w-36 cursor-pointer items-center justify-center gap-1.5 rounded-md px-2 py-1 font-semibold hover:bg-foreground/5"
      >
        {LONG.format(new Date(`${month}-01T00:00:00Z`))}
        <i className="pi pi-chevron-down text-[10px] text-muted" aria-hidden />
      </button>
      {open && (
        <div role="dialog" aria-label="Pick a month" className="card absolute right-0 top-full z-40 mt-1 w-64 p-3 shadow-lg sm:left-1/2 sm:right-auto sm:-translate-x-1/2">
          <div className="mb-2 flex items-center justify-between">
            <button type="button" className={step} onClick={() => setYear(year - 1)} aria-label="Previous year">
              <i className="pi pi-chevron-left text-xs" aria-hidden />
            </button>
            <span className="font-semibold tabular-nums">{year}</span>
            <button type="button" className={step} onClick={() => setYear(year + 1)} aria-label="Next year">
              <i className="pi pi-chevron-right text-xs" aria-hidden />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-1">
            {MONTHS.map((name, i) => {
              const m = `${year}-${String(i + 1).padStart(2, "0")}`;
              const shown = m === month;
              return (
                <Link
                  key={m}
                  href={href(m)}
                  onClick={() => setOpen(false)}
                  aria-current={shown ? "date" : undefined}
                  className={`rounded-md py-2 text-center text-sm transition-colors ${
                    shown
                      ? "bg-primary font-semibold text-(--primary-fg)"
                      : m === current
                        ? "font-semibold ring-1 ring-border hover:bg-foreground/5"
                        : "hover:bg-foreground/5"
                  }`}
                >
                  {name}
                </Link>
              );
            })}
          </div>
          {month !== current && (
            <Link
              href={href(current)}
              onClick={() => setOpen(false)}
              className="mt-2 block rounded-md border border-border py-1.5 text-center text-xs font-medium hover:bg-foreground/5"
            >
              This month
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
