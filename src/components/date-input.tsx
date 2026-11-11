"use client";

import type { InputHTMLAttributes } from "react";

/** A date field that opens its calendar when you click anywhere in it, not only on the icon. */
export function DateInput({ className = "input text-foreground", onClick, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  return (
    <input
      {...props}
      type="date"
      className={className}
      onClick={(e) => {
        onClick?.(e);
        try {
          e.currentTarget.showPicker();
        } catch {
          // Not supported, or the field is read-only: the browser's own behaviour is fine.
        }
      }}
    />
  );
}
