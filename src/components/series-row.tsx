"use client";

import { useState, type ReactNode } from "react";

/** A table row that opens a details row under it when clicked. Links and buttons inside keep working. */
export function SeriesRow({
  title,
  cells,
  details,
  colSpan,
}: {
  title: string;
  cells: ReactNode;
  details: ReactNode;
  colSpan: number;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <tr
        className={`cursor-pointer border-b border-border transition-colors hover:bg-primary/5 ${open ? "bg-primary/5" : "last:border-0"}`}
        onClick={(e) => {
          if (!(e.target as HTMLElement).closest("a,button,[role=menu]")) setOpen((o) => !o);
        }}
      >
        <td className="w-8 pl-3">
          <button
            type="button"
            className="cursor-pointer text-muted hover:text-foreground"
            aria-expanded={open}
            aria-label={`${open ? "Hide" : "Show"} details for ${title}`}
            onClick={() => setOpen((o) => !o)}
          >
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`transition-transform ${open ? "rotate-90" : ""}`}
            >
              <path d="m9 6 6 6-6 6" />
            </svg>
          </button>
        </td>
        {cells}
      </tr>
      {open && (
        <tr className="border-b border-border bg-black/[0.02] last:border-0 dark:bg-white/[0.03]">
          <td colSpan={colSpan} className="px-3 py-3">
            {details}
          </td>
        </tr>
      )}
    </>
  );
}
