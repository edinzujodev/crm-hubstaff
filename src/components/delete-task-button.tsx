"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { deleteTask } from "@/app/actions";

export function DeleteTaskButton({ taskId, title, redirectTo }: { taskId: number; title: string; redirectTo?: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return (
    <button
      className="btn text-red-600"
      disabled={pending}
      onClick={() => {
        if (!confirm(`Delete "${title}"? Its sessions are removed too. This can't be undone.`)) return;
        startTransition(async () => {
          const res = await deleteTask(taskId);
          if (!res.ok) alert(res.error);
          else if (redirectTo) router.push(redirectTo);
        });
      }}
    >
      {pending ? "Deleting…" : "Delete"}
    </button>
  );
}
