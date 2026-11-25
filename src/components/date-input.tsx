"use client";

import { Calendar, type CalendarDateTemplateEvent } from "primereact/calendar";
import { useState } from "react";

const toDate = (iso: string | undefined | null) => {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  return y && m && d ? new Date(y, m - 1, d) : null;
};
/** A day picked out in the picker: blocked (red, struck through) or a public holiday (green). */
export type DayMark = { tone: "blocked" | "holiday"; title: string };

const MARK_CLASS: Record<DayMark["tone"], string> = {
  blocked: "bg-red-500/15 text-red-700 line-through decoration-red-500/70 dark:text-red-300",
  holiday: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300",
};
const LEGEND: Record<DayMark["tone"], string> = { blocked: "Blocked for time off", holiday: "Public holiday" };

const toIso = (d: Date | null) =>
  d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` : "";

/**
 * A PrimeReact date picker that is used like <input type="date">: it holds a yyyy-mm-dd value, submits it under
 * `name`, and onChange reads e.target.value.
 */
export function DateInput({
  name,
  value,
  defaultValue,
  required,
  disabled,
  className,
  max,
  disabledDays,
  marks,
  onChange,
}: {
  name?: string;
  value?: string;
  defaultValue?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  /** Latest date that can be picked (yyyy-mm-dd), e.g. today for a birth date. */
  max?: string;
  /** Days that can't be picked (yyyy-mm-dd). */
  disabledDays?: string[];
  /** Days to colour in the picker (yyyy-mm-dd), with what they are on hover and a legend under the month. */
  marks?: Record<string, DayMark>;
  onChange?: (e: { target: { value: string } }) => void;
}) {
  const [inner, setInner] = useState(defaultValue ?? "");
  const current = value !== undefined ? value : inner;
  const tones = marks ? [...new Set(Object.values(marks).map((m) => m.tone))].sort() : [];
  return (
    <>
      <Calendar
        value={toDate(current)}
        dateFormat="dd/mm/yy"
        showIcon
        showButtonBar
        disabled={disabled}
        required={required}
        maxDate={toDate(max) ?? undefined}
        disabledDates={disabledDays?.map((d) => toDate(d)!).filter(Boolean)}
        dateTemplate={
          marks
            ? (d: CalendarDateTemplateEvent) => {
                const mark = marks[`${d.year}-${String(d.month + 1).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`];
                if (!mark) return d.day;
                return (
                  <span title={mark.title} className={`flex h-full w-full items-center justify-center rounded-full ${MARK_CLASS[mark.tone]}`}>
                    {d.day}
                  </span>
                );
              }
            : undefined
        }
        footerTemplate={
          tones.length
            ? () => (
                <div className="flex flex-wrap gap-3 px-1 pt-2 text-xs text-muted">
                  {tones.map((t) => (
                    <span key={t} className="flex items-center gap-1.5">
                      <span className={`h-2.5 w-2.5 rounded-full ${MARK_CLASS[t]}`} aria-hidden />
                      {LEGEND[t]}
                    </span>
                  ))}
                </div>
              )
            : undefined
        }
        className={className}
        appendTo={typeof document === "undefined" ? undefined : document.body}
        onChange={(e) => {
          const next = toIso((e.value as Date | null) ?? null);
          if (value === undefined) setInner(next);
          onChange?.({ target: { value: next } });
        }}
      />
      {name && <input type="hidden" name={name} value={current} required={required} />}
    </>
  );
}
