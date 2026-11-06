"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { deleteTask, updateTask } from "@/app/actions";
import { Modal } from "@/components/modal";
import { truncate } from "@/lib/format";

type Option = { id: number; name: string };
type TaskFields = {
  id: number;
  title: string;
  clientId: number | null;
  assigneeId: number | null;
  dueDate: string | null;
  repeat: "weekly" | "monthly" | null;
  repeatLeadDays: number | null;
};

/** The ⋯ button at the end of a row, with Edit and Delete. Both open a popup. */
export function TaskMenu({ task, clients, users }: { task: TaskFields; clients: Option[]; users: Option[] }) {
  const [menu, setMenu] = useState<{ top: number; right: number } | null>(null);
  const [modal, setModal] = useState<"edit" | "delete" | null>(null);
  const button = useRef<HTMLButtonElement>(null);

  // Close the menu on any outside click, scroll, resize or Escape.
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("pointerdown", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  const toggle = () => {
    if (menu) return setMenu(null);
    const r = button.current!.getBoundingClientRect();
    setMenu({ top: r.bottom + 4, right: window.innerWidth - r.right });
  };
  const choose = (m: "edit" | "delete") => {
    setMenu(null);
    setModal(m);
  };

  return (
    <>
      <button
        ref={button}
        type="button"
        aria-label={`Actions for ${task.title}`}
        aria-haspopup="menu"
        aria-expanded={!!menu}
        className="btn px-2"
        // The window's pointerdown closes the menu; stop it so this click can toggle it.
        onPointerDown={(e) => e.nativeEvent.stopImmediatePropagation()}
        onClick={toggle}
      >
        ⋯
      </button>
      {menu && (
        <div
          role="menu"
          style={{ top: menu.top, right: menu.right }}
          className="card fixed z-40 w-36 py-1 text-sm shadow-lg"
          onPointerDown={(e) => e.nativeEvent.stopImmediatePropagation()}
        >
          <button
            role="menuitem"
            className="block w-full px-3 py-1.5 text-left hover:bg-black/5 dark:hover:bg-white/10"
            onClick={() => choose("edit")}
          >
            Edit
          </button>
          <button
            role="menuitem"
            className="block w-full px-3 py-1.5 text-left text-red-600 hover:bg-black/5 dark:hover:bg-white/10"
            onClick={() => choose("delete")}
          >
            Delete
          </button>
        </div>
      )}
      {modal === "edit" && (
        <Modal title="Edit task" onClose={() => setModal(null)}>
          <EditForm task={task} clients={clients} users={users} onDone={() => setModal(null)} />
        </Modal>
      )}
      {modal === "delete" && (
        <Modal title="Delete task?" onClose={() => setModal(null)}>
          <DeleteConfirm task={task} onDone={() => setModal(null)} />
        </Modal>
      )}
    </>
  );
}

function EditForm({
  task,
  clients,
  users,
  onDone,
}: {
  task: TaskFields;
  clients: Option[];
  users: Option[];
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState(updateTask.bind(null, task.id), null);
  const hubstaffWarning = state?.ok ? state.data.hubstaffError : undefined;

  useEffect(() => {
    if (state?.ok && !state.data.hubstaffError) onDone();
  }, [state, onDone]);

  return (
    <form action={action} className="space-y-3">
      <label className="flex flex-col gap-1 text-xs text-muted">
        Title
        <input name="title" required defaultValue={task.title} className="input text-foreground" />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-xs text-muted">
          Client
          <select name="clientId" required defaultValue={task.clientId ?? ""} className="input text-foreground">
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
          <select name="assigneeId" defaultValue={task.assigneeId ?? ""} className="input text-foreground">
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
          <input type="date" name="dueDate" defaultValue={task.dueDate ?? ""} className="input text-foreground" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Repeats
          <select name="repeat" defaultValue={task.repeat ?? ""} className="input text-foreground">
            <option value="">One-time</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </label>
        <label className="col-span-2 flex flex-col gap-1 text-xs text-muted">
          Show new copies in my list (days before due, for repeating tasks)
          <input
            type="number"
            name="repeatLeadDays"
            min={0}
            max={90}
            defaultValue={task.repeatLeadDays ?? ""}
            placeholder="Default: 2 weekly, 7 monthly"
            className="input text-foreground"
          />
        </label>
      </div>
      {state && !state.ok && <p className="text-sm text-red-600">{state.error}</p>}
      {hubstaffWarning && (
        <p className="text-sm text-amber-700 dark:text-amber-400">
          Saved, but the Hubstaff task was not renamed ({hubstaffWarning}).
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn" onClick={onDone}>
          {hubstaffWarning ? "Close" : "Cancel"}
        </button>
        {!hubstaffWarning && (
          <button className="btn btn-primary" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </button>
        )}
      </div>
    </form>
  );
}

function DeleteConfirm({ task, onDone }: { task: TaskFields; onDone: () => void }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const onDelete = () =>
    startTransition(async () => {
      setError(null);
      const res = await deleteTask(task.id);
      if (!res.ok) return setError(res.error);
      if (res.data.hubstaffError) return setWarning(res.data.hubstaffError);
      onDone();
    });

  if (warning)
    return (
      <div className="space-y-3">
        <p className="text-sm text-amber-700 dark:text-amber-400">
          Deleted in the CRM, but the Hubstaff task could not be marked ({warning}).
        </p>
        <div className="flex justify-end">
          <button className="btn" onClick={onDone}>
            Close
          </button>
        </div>
      </div>
    );

  return (
    <div className="space-y-3">
      <p className="text-sm">
        Delete <span className="font-medium">{truncate(task.title, 50)}</span>?
      </p>
      <p className="text-sm text-muted">
        It is hidden from the task list and any running timer on it is stopped. Tracked hours are kept, and you can
        restore it from the Deleted tab.
      </p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn" onClick={onDone} disabled={pending}>
          Cancel
        </button>
        <button type="button" className="btn btn-danger" onClick={onDelete} disabled={pending}>
          {pending ? "Deleting…" : "Delete"}
        </button>
      </div>
    </div>
  );
}
