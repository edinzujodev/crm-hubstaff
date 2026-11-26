"use client";

import { deleteTask } from "@/app/actions";
import { DeleteButton } from "@/components/delete-button";

export function DeleteTaskButton({ taskId, title, redirectTo }: { taskId: number; title: string; redirectTo?: string }) {
  return (
    <DeleteButton
      title="Delete task?"
      what={title}
      note="It moves to Deleted, where it can be restored."
      redirectTo={redirectTo}
      deletedLink
      action={() => deleteTask(taskId)}
    />
  );
}
