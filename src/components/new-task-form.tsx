"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createTask } from "@/app/actions";

type Option = { id: number; name: string };

export function NewTaskForm({ clients, users }: { clients: Option[]; users: Option[] }) {
  const [state, action, pending] = useActionState(createTask, null);
  const form = useRef<HTMLFormElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const [repeat, setRepeat] = useState<"" | "weekly" | "monthly">("");
  const [asked, setAsked] = useState(false);
  const [hasDue, setHasDue] = useState(false);
  useEffect(() => {
    if (state?.ok) form.current?.reset();
  }, [state]);

  // Ask "is it recurring?" once per submit, then submit with the answer.
  function ask(e: React.FormEvent<HTMLFormElement>) {
    if (asked) return setAsked(false);
    e.preventDefault();
    setHasDue(!!new FormData(e.currentTarget).get("dueDate"));
    dialog.current?.showModal();
  }
  function answer(value: "" | "weekly" | "monthly") {
    setRepeat(value);
    setAsked(true);
    dialog.current?.close();
    // Wait a tick so the hidden input holds the answer before submitting.
    setTimeout(() => form.current?.requestSubmit(), 0);
  }

  return (
    <form ref={form} action={action} onSubmit={ask} className="card flex flex-wrap items-end gap-2 p-3">
      <label className="flex min-w-60 flex-1 flex-col gap-1 text-xs text-muted">
        New task
        <input name="title" required placeholder="e.g. Monthly bank reconciliation" className="input text-foreground" />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Client
        <select name="clientId" required className="input text-foreground" defaultValue="">
          <option value="" disabled>
            Select…
          </option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Assignee
        <select name="assigneeId" className="input text-foreground" defaultValue="">
          <option value="">—</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Due
        <input type="date" name="dueDate" className="input text-foreground" />
      </label>
      <input type="hidden" name="repeat" value={repeat} />
      <button className="btn btn-primary" disabled={pending}>
        {pending ? "Adding…" : "Add task"}
      </button>
      {state && !state.ok && <p className="w-full text-sm text-red-600">{state.error}</p>}
      {state?.ok && state.data.hubstaffError && (
        <p className="w-full text-sm text-amber-700 dark:text-amber-400">
          Task saved, but it was not created in Hubstaff yet ({state.data.hubstaffError}). Start will try again.
        </p>
      )}
      <dialog ref={dialog} className="card m-auto w-80 p-4 text-foreground backdrop:bg-black/40">
        <p className="font-medium">Is this task recurring?</p>
        <p className="mt-1 text-sm text-muted">
          When you mark it done, the next one is created automatically, due one period after this due date.
        </p>
        {!hasDue && <p className="mt-2 text-sm text-amber-700 dark:text-amber-400">Set a due date to make it recurring.</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className="btn btn-primary" disabled={!hasDue} onClick={() => answer("weekly")}>
            Weekly
          </button>
          <button type="button" className="btn btn-primary" disabled={!hasDue} onClick={() => answer("monthly")}>
            Monthly
          </button>
          <button type="button" className="btn" onClick={() => answer("")}>
            No
          </button>
        </div>
      </dialog>
    </form>
  );
}
