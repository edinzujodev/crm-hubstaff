"use client";

import { useState, useTransition } from "react";
import { toggleChecklistItem } from "@/app/actions";

/** A compact checklist that can be ticked right where it is shown, e.g. in an expanded row. */
export function InlineChecklist({
  items,
  canTick,
}: {
  items: { id: number; text: string; done: boolean }[];
  canTick: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item.id} className="text-sm">
            <label className={`flex items-center gap-2 ${canTick ? "cursor-pointer" : ""}`}>
              <input
                type="checkbox"
                checked={item.done}
                disabled={pending || !canTick}
                className="h-4 w-4 cursor-pointer"
                aria-label={item.text}
                onChange={(e) =>
                  start(async () => {
                    const res = await toggleChecklistItem(item.id, e.target.checked);
                    setError(res.ok ? null : (res.error ?? "Something went wrong"));
                  })
                }
              />
              <span className={item.done ? "text-muted line-through" : ""}>{item.text}</span>
            </label>
          </li>
        ))}
      </ul>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
