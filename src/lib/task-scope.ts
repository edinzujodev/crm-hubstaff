// Plain module (no "use client"), so both the server page and the client toggle can import the real values.
export type TaskScope = "mine" | "team" | "unassigned";
export const TASK_SCOPES: readonly TaskScope[] = ["mine", "team", "unassigned"];
export const TASK_SCOPE_COOKIE = "tasks_scope";
