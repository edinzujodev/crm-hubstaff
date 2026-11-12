"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useTransition } from "react";
import { saveTaskScope } from "@/app/tasks/scope-action";
import { TASK_SCOPES, type TaskScope } from "@/lib/task-scope";

/** Whose tasks to list: mine, the team's or unassigned. The choice is saved in a cookie, so it survives a refresh. */
export function TaskScopeToggle({ scope, teamLabel }: { scope: TaskScope; teamLabel: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const labels: Record<TaskScope, string> = { mine: "My tasks", team: teamLabel, unassigned: "Unassigned" };

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
    <select
      aria-label="Whose tasks"
      value={scope}
      disabled={pending}
      onChange={(e) => choose(e.target.value as TaskScope)}
      className="input h-8 w-auto cursor-pointer py-0 text-sm font-medium"
    >
      {TASK_SCOPES.map((key) => (
        <option key={key} value={key}>
          {labels[key]}
        </option>
      ))}
    </select>
  );
}
