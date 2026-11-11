"use server";

import { cookies } from "next/headers";
import { TASK_SCOPE_COOKIE, TASK_SCOPES, type TaskScope } from "@/lib/task-scope";

/** Remembers whether the task list shows my tasks or the team's. */
export async function saveTaskScope(scope: TaskScope) {
  (await cookies()).set(TASK_SCOPE_COOKIE, TASK_SCOPES.includes(scope) ? scope : "mine", {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
}
