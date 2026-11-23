"use client";

import { useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";

/**
 * A 6-digit code typed into six boxes. Typing moves to the next box, Backspace to the previous one, and pasting a
 * whole code fills every box. The code is submitted under `name`; with `autoSubmit` the form is sent as soon as the
 * last digit is in.
 */
export function CodeInput({
  name = "code",
  length = 6,
  autoSubmit = true,
  disabled,
  invalid,
  autoFocus,
}: {
  name?: string;
  length?: number;
  autoSubmit?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  autoFocus?: boolean;
}) {
  const [digits, setDigits] = useState<string[]>(() => Array(length).fill(""));
  const boxes = useRef<(HTMLInputElement | null)[]>([]);
  const hidden = useRef<HTMLInputElement>(null);

  function update(next: string[], focus: number) {
    setDigits(next);
    boxes.current[Math.min(Math.max(focus, 0), length - 1)]?.focus();
    if (autoSubmit && next.every(Boolean)) {
      // Let React write the hidden input first, then send the form.
      requestAnimationFrame(() => hidden.current?.form?.requestSubmit());
    }
  }

  function fill(from: number, text: string) {
    const typed = text.replace(/\D/g, "").slice(0, length - from).split("");
    if (!typed.length) return;
    const next = [...digits];
    typed.forEach((d, i) => (next[from + i] = d));
    update(next, from + typed.length);
  }

  function onKeyDown(i: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[i] && i > 0) {
      e.preventDefault();
      const next = [...digits];
      next[i - 1] = "";
      update(next, i - 1);
    } else if (e.key === "ArrowLeft") {
      boxes.current[i - 1]?.focus();
    } else if (e.key === "ArrowRight") {
      boxes.current[i + 1]?.focus();
    }
  }

  function onPaste(i: number, e: ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    fill(i, e.clipboardData.getData("text"));
  }

  return (
    <div className="flex gap-2" role="group" aria-label="6-digit code">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            boxes.current[i] = el;
          }}
          value={d}
          disabled={disabled}
          autoFocus={autoFocus && i === 0}
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          aria-label={`Digit ${i + 1}`}
          aria-invalid={invalid || undefined}
          maxLength={length}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "");
            if (v.length > 1) return fill(i, v); // autofill or fast typing
            const next = [...digits];
            next[i] = v;
            update(next, v ? i + 1 : i);
          }}
          onKeyDown={(e) => onKeyDown(i, e)}
          onPaste={(e) => onPaste(i, e)}
          onFocus={(e) => e.target.select()}
          className={`h-12 w-11 rounded-lg border bg-surface text-center font-mono text-lg font-semibold text-foreground outline-none transition focus:border-foreground focus:ring-2 focus:ring-foreground/15 disabled:opacity-50 sm:w-12 ${
            invalid ? "border-red-500" : "border-border"
          }`}
        />
      ))}
      <input ref={hidden} type="hidden" name={name} value={digits.join("")} />
    </div>
  );
}
