"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createTask } from "@/app/actions";
import { ProjectField, type ProjectOption } from "@/components/project-field";

type Option = { id: number; name: string };
type Repeat = "" | "weekly" | "monthly";

// How many days before it is due a new copy shows up in the open-task lists.
const DEFAULT_LEAD = { weekly: 2, monthly: 7 } as const;

/** `bare` drops the card styling, for use inside something that already is one (a dashboard widget). */
export function NewTaskForm({
  clients,
  users,
  projects,
  bare = false,
}: {
  clients: Option[];
  users: Option[];
  projects: ProjectOption[];
  bare?: boolean;
}) {
  const [state, action, pending] = useActionState(createTask, null);
  const form = useRef<HTMLFormElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const [repeat, setRepeat] = useState<Repeat>("");
  const [lead, setLead] = useState("");
  const [asked, setAsked] = useState(false);
  const [hasDue, setHasDue] = useState(false);
  const [title, setTitle] = useState("");
  const [clientId, setClientId] = useState("");
  // Bumped after a task is added so the project field starts over too.
  const [round, setRound] = useState(0);
  // After a task is added (a new action result), clear the form.
  const [handled, setHandled] = useState(state);
  if (state !== handled) {
    setHandled(state);
    if (state?.ok) {
      setTitle("");
      setClientId("");
      setRound((n) => n + 1);
    }
  }
  useEffect(() => {
    if (state?.ok) form.current?.reset();
  }, [state]);

  // Ask "is it recurring?" once per submit, then submit with the answer.
  function ask(e: React.FormEvent<HTMLFormElement>) {
    if (asked) return setAsked(false);
    e.preventDefault();
    setHasDue(!!new FormData(e.currentTarget).get("dueDate"));
    setRepeat("");
    dialog.current?.showModal();
  }
  function choose(value: Repeat) {
    setRepeat(value);
    setLead(value ? String(DEFAULT_LEAD[value]) : "");
  }
  function confirm() {
    setAsked(true);
    dialog.current?.close();
    // Wait a tick so the hidden inputs hold the answer before submitting.
    setTimeout(() => form.current?.requestSubmit(), 0);
  }

  return (
    <form ref={form} action={action} onSubmit={ask} className={`flex flex-wrap items-end gap-2 ${bare ? "" : "card p-3"}`}>
      <label className="flex min-w-60 flex-1 flex-col gap-1 text-xs text-muted">
        New task
        <input
          name="title"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Monthly bank reconciliation"
          className="input text-foreground"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Client
        <select
          name="clientId"
          required
          className="input text-foreground"
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
        >
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
      <ProjectField key={round} clientId={clientId} title={title} projects={projects} />
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
      <input type="hidden" name="repeatLeadDays" value={repeat ? lead : ""} />
      <button className="btn btn-primary" disabled={pending}>
        {pending ? "Adding…" : "Add task"}
      </button>
      {state && !state.ok && <p className="w-full text-sm text-red-600">{state.error}</p>}
      {state?.ok && state.data.hubstaffError && (
        <p className="w-full text-sm text-amber-700 dark:text-amber-400">
          Task saved, but it was not created in Hubstaff yet ({state.data.hubstaffError}). Start will try again.
        </p>
      )}
      <dialog ref={dialog} className="card m-auto w-96 max-w-[calc(100vw-2rem)] p-5 text-foreground backdrop:bg-black/40">
        <p className="font-medium">Is this task recurring?</p>
        <p className="mt-1 text-sm text-muted">
          When you press Finish on it, the next one is created automatically, due one period after this due date.
        </p>
        <div className="mt-3 flex gap-2">
          {(
            [
              ["", "No, one-time"],
              ["weekly", "Weekly"],
              ["monthly", "Monthly"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              disabled={value !== "" && !hasDue}
              onClick={() => choose(value)}
              aria-pressed={repeat === value}
              className={`btn ${repeat === value ? "btn-primary" : ""}`}
            >
              {label}
            </button>
          ))}
        </div>
        {!hasDue && <p className="mt-2 text-sm text-amber-700 dark:text-amber-400">Set a due date to make it recurring.</p>}
        {repeat && (
          <label className="mt-3 flex flex-col gap-1 text-sm">
            <span>
              Show each new one in my list{" "}
              <input
                type="number"
                min={0}
                max={90}
                value={lead}
                onChange={(e) => setLead(e.target.value)}
                className="input w-16 text-center"
              />{" "}
              days before it is due
            </span>
            <span className="text-xs text-muted">
              Until then it stays out of your open tasks (it shows in the open list with a “Starts …” badge), so finishing one
              doesn&apos;t put the next one straight back in your list.
            </span>
          </label>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="btn" onClick={() => dialog.current?.close()}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={confirm}>
            Add task
          </button>
        </div>
      </dialog>
    </form>
  );
}
