export type FinishedNotice = {
  taskId: number;
  title: string;
  nextTaskId: number | null;
  nextDueDate: string | null;
};

export const FINISHED_EVENT = "crm:task-finished";

/**
 * Tells the Toaster (mounted in the layout) that a task was finished. The layout
 * stays mounted when the finished task's row leaves the list, so the notice survives it.
 */
export function notifyFinished(notice: FinishedNotice) {
  window.dispatchEvent(new CustomEvent<FinishedNotice>(FINISHED_EVENT, { detail: notice }));
}
