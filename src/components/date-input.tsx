"use client";

import { Calendar } from "primereact/calendar";
import { useState } from "react";

const toDate = (iso: string | undefined | null) => {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  return y && m && d ? new Date(y, m - 1, d) : null;
};
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
  onChange,
}: {
  name?: string;
  value?: string;
  defaultValue?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  onChange?: (e: { target: { value: string } }) => void;
}) {
  const [inner, setInner] = useState(defaultValue ?? "");
  const current = value !== undefined ? value : inner;
  return (
    <>
      <Calendar
        value={toDate(current)}
        dateFormat="dd/mm/yy"
        showIcon
        showButtonBar
        disabled={disabled}
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
