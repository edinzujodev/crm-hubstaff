"use client";

import { deleteTask } from "@/app/actions";
import { HoldToDelete } from "@/components/hold-to-delete";

export function DeleteTaskButton({ taskId, title, redirectTo }: { taskId: number; title: string; redirectTo?: string }) {
  return <HoldToDelete title={title} redirectTo={redirectTo} action={() => deleteTask(taskId)} />;
}
