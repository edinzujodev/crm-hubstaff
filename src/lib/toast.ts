export type FinishedNotice = {
  taskId: number;
  title: string;
  nextTaskId: number | null;
  nextDueDate: string | null;
  /** True when the task went to the team leader for review instead of being done. */
  inReview?: boolean;
};

export const FINISHED_EVENT = "crm:task-finished";

/**
 * Tells the Toaster (mounted in the layout) that a task was finished. The layout
 * stays mounted when the finished task's row leaves the list, so the notice survives it.
 */
export function notifyFinished(notice: FinishedNotice) {
  window.dispatchEvent(new CustomEvent<FinishedNotice>(FINISHED_EVENT, { detail: notice }));
}

export type Toast = {
  message: string;
  /** Smaller grey text under the message. */
  detail?: string;
  /** "error" turns the toast red; the default is green. */
  tone?: "success" | "error";
  /** A link shown in the toast, e.g. to the list the task moved to. */
  link?: { href: string; label: string };
};

export const TOAST_EVENT = "crm:toast";

/** Shows a small toast in the bottom right corner, e.g. after an action finished. */
export function notify(toast: Toast) {
  window.dispatchEvent(new CustomEvent<Toast>(TOAST_EVENT, { detail: toast }));
}
