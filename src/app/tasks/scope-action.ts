"use server";

import { cookies } from "next/headers";

/** Remembers whether the task list shows my tasks or the team's. */
export async function saveTaskScope(scope: "mine" | "team") {
  (await cookies()).set("tasks_scope", scope === "team" ? "team" : "mine", {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
}
