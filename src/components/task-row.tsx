"use client";

import { useState, type ReactNode } from "react";

type Props = {
  /** Cells that are always visible, in column order (without the toggle and actions cells). */
  cells: ReactNode[];
  /** The buttons at the end of the row. */
  actions: ReactNode;
  /** Shown under the row when it is expanded. */
  details: ReactNode;
};

/** A table row that expands to show more. Clicking links, buttons or inputs inside it doesn't toggle it. */
export function TaskRow({ cells, actions, details }: Props) {
  const [open, setOpen] = useState(false);
  const columns = cells.length + 2;

  return (
    <>
      <tr
        className="cursor-pointer border-b border-border last:border-0 hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("a,button,select,input,dialog")) return;
          setOpen((o) => !o);
        }}
      >
        <td className="w-8 py-2 pl-3">
          <button
            type="button"
            aria-label={open ? "Hide details" : "Show details"}
            aria-expanded={open}
            className="text-muted"
            onClick={() => setOpen((o) => !o)}
          >
            {open ? "▾" : "▸"}
          </button>
        </td>
        {cells.map((cell, i) => (
          <td key={i} className="px-3 py-2">
            {cell}
          </td>
        ))}
        <td className="px-3 py-2">
          <div className="flex items-center gap-2">{actions}</div>
        </td>
      </tr>
      {open && (
        <tr className="border-b border-border bg-black/[0.02] last:border-0 dark:bg-white/[0.03]">
          <td colSpan={columns} className="px-3 py-3 pl-11">
            {details}
          </td>
        </tr>
      )}
    </>
  );
}
