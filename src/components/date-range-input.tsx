"use client";

import { Calendar } from "primereact/calendar";
import { useState } from "react";

const toDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return y && m && d ? new Date(y, m - 1, d) : null;
};
const toIso = (d: Date | null | undefined) =>
  d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` : "";

/**
 * One box for a date range: click it, pick the first and the last day. It submits two values,
 * `fromName` and `toName` (yyyy-mm-dd), like two separate date fields would.
 */
export function DateRangeInput({
  fromName,
  toName,
  defaultFrom,
  defaultTo,
  className,
}: {
  fromName: string;
  toName: string;
  defaultFrom: string;
  defaultTo: string;
  className?: string;
}) {
  const [range, setRange] = useState<(Date | null)[] | null>([toDate(defaultFrom), toDate(defaultTo)]);
  const from = toIso(range?.[0]);
  // While only the first day is picked, the range ends on that same day.
  const to = toIso(range?.[1] ?? range?.[0]);
  return (
    <>
      <Calendar
        value={range as Date[] | null}
        selectionMode="range"
        readOnlyInput
        dateFormat="dd/mm/yy"
        showIcon
        showButtonBar
        className={className}
        appendTo={typeof document === "undefined" ? undefined : document.body}
        onChange={(e) => setRange((e.value as Date[] | null | undefined) ?? null)}
      />
      <input type="hidden" name={fromName} value={from} />
      <input type="hidden" name={toName} value={to} />
    </>
  );
}
