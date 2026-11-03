"use client";

import { useRef, useState, type ReactNode } from "react";

type Tip = { x: number; y: number; lines: string[] };

/**
 * Hover and focus tooltip for the charts inside it. Any element with a
 * `data-tip` attribute gets one: the first line is the value (strong), the
 * rest is context. Lines are separated by a newline.
 */
export function ChartTip({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<Tip | null>(null);

  function show(target: EventTarget, at?: { x: number; y: number }) {
    const el = (target as Element).closest?.("[data-tip]");
    const box = root.current?.getBoundingClientRect();
    if (!el || !box) return setTip(null);
    const r = el.getBoundingClientRect();
    const x = at ? at.x - box.left : r.left + r.width / 2 - box.left;
    const y = at ? r.top - box.top : r.top - box.top;
    setTip({ x: Math.min(Math.max(x, 90), box.width - 90), y, lines: (el.getAttribute("data-tip") ?? "").split("\n") });
  }

  return (
    <div
      ref={root}
      className="relative"
      onPointerMove={(e) => show(e.target, { x: e.clientX, y: e.clientY })}
      onPointerLeave={() => setTip(null)}
      onFocus={(e) => show(e.target)}
      onBlur={() => setTip(null)}
    >
      {children}
      {tip && (
        <div
          role="tooltip"
          className="pointer-events-none absolute z-10 w-max max-w-64 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs shadow-sm"
          style={{ left: tip.x, top: tip.y, transform: "translate(-50%, calc(-100% - 8px))" }}
        >
          <p className="text-sm font-semibold text-foreground">{tip.lines[0]}</p>
          {tip.lines.slice(1).map((l, i) => (
            <p key={i} className="text-muted">
              {l}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
