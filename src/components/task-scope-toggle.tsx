"use client";

import { Select } from "@/components/ui";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useOptimistic, useTransition } from "react";
import { saveTaskScope } from "@/app/tasks/scope-action";
import { TASK_SCOPES, type TaskScope } from "@/lib/task-scope";

/** Whose tasks to list: mine, the team's or unassigned. The choice is saved in a cookie, so it survives a refresh. */
export function TaskScopeToggle({ scope, teamLabel }: { scope: TaskScope; teamLabel: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  // Shows the new choice on the click; the saved cookie takes over once the list has re-rendered.
  const [shown, setShown] = useOptimistic(scope);
  const labels: Record<TaskScope, string> = { mine: "My tasks", team: teamLabel, unassigned: "Unassigned" };

  function choose(next: TaskScope) {
    if (next === shown) return;
    // Drop a ?scope= link override so the saved choice applies.
    const q = new URLSearchParams(params.toString());
    q.delete("scope");
    // Picking whose tasks to list replaces a picked team or person.
    q.delete("team");
    q.delete("person");
    const href = q.size ? `${pathname}?${q}` : pathname;
    const current = params.size ? `${pathname}?${params}` : pathname;
    startTransition(async () => {
      setShown(next);
      // Setting the cookie re-renders this page in the same response. Only when the address has to lose
      // ?scope=, ?team= or ?person= is a navigation needed, and that render reads the new cookie too.
      await saveTaskScope(next);
      if (href !== current) router.replace(href);
    });
  }

  return (
    <Select
      aria-label="Whose tasks"
      value={shown}
      disabled={pending}
      onChange={(e) => choose(e.target.value as TaskScope)}
      className="w-auto text-sm font-medium"
    >
      {TASK_SCOPES.map((key) => (
        <option key={key} value={key}>
          {labels[key]}
        </option>
      ))}
    </Select>
  );
}
