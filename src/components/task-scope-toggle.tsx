"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useTransition } from "react";
import { saveTaskScope } from "@/app/tasks/scope-action";
import type { TaskScope } from "@/lib/task-scope";

/** My tasks / team tasks switch. The choice is saved in a cookie, so it survives a refresh. */
export function TaskScopeToggle({ scope, teamLabel }: { scope: TaskScope; teamLabel: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  function choose(next: TaskScope) {
    if (next === scope) return;
    // Drop a ?scope= link override so the saved choice applies.
    const q = new URLSearchParams(params.toString());
    q.delete("scope");
    startTransition(async () => {
      await saveTaskScope(next);
      router.replace(q.size ? `${pathname}?${q}` : pathname);
      router.refresh();
    });
  }

  return (
    <div role="group" aria-label="Whose tasks" className={`inline-flex gap-0.5 rounded-lg bg-black/5 p-0.5 text-sm dark:bg-white/10 ${pending ? "opacity-60" : ""}`}>
      {(
        [
          ["mine", "My tasks"],
          ["team", teamLabel],
          ["unassigned", "Unassigned"],
        ] as const
      ).map(([key, label]) => (
        <button
          key={key}
          type="button"
          aria-pressed={scope === key}
          onClick={() => choose(key)}
          className={`cursor-pointer rounded-md px-3 py-1 transition-colors ${scope === key ? "bg-surface font-semibold shadow-sm" : "text-muted hover:text-foreground"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
