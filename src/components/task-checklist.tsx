"use client";

import { useState, useTransition } from "react";
import { addChecklistItem, removeChecklistItem, setTaskInstructions, toggleChecklistItem } from "@/app/actions";

export type ChecklistItem = { id: number; text: string; done: boolean };

/**
 * The how-to of a task: instructions and a checklist. Anyone on the task can tick items, but the task can be
 * finished without ticking them all (finishing ticks what is left). Managers edit the list and instructions
 *.
 */
export function TaskChecklist({
  taskId,
  description,
  items,
  canEdit,
  canTick,
}: {
  taskId: number;
  description: string | null;
  items: ChecklistItem[];
  canEdit: boolean;
  canTick: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [notes, setNotes] = useState(description ?? "");
  const [editingNotes, setEditingNotes] = useState(false);
  const doneCount = items.filter((i) => i.done).length;

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) =>
    start(async () => {
      const res = await fn();
      setError(res.ok ? null : (res.error ?? "Something went wrong"));
      if (res.ok) after?.();
    });

  return (
    <section className="card space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">
          How to do this
          {items.length > 0 && (
            <span className="ml-2 text-sm font-normal text-muted">
              {doneCount} of {items.length} checked
            </span>
          )}
        </h2>
      </div>

      {editingNotes ? (
        <div className="space-y-2">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            autoFocus
            placeholder="What needs to be done, and how"
            className="input w-full text-foreground"
          />
          <div className="flex gap-2">
            <button
              type="button"
              className="btn btn-primary"
              disabled={pending}
              onClick={() => run(() => setTaskInstructions(taskId, notes), () => setEditingNotes(false))}
            >
              Save
            </button>
            <button type="button" className="btn" onClick={() => (setNotes(description ?? ""), setEditingNotes(false))}>
              Cancel
            </button>
          </div>
        </div>
      ) : description ? (
        <p className="whitespace-pre-wrap text-sm">
          {description}
          {canEdit && (
            <button type="button" className="ml-2 cursor-pointer text-xs text-muted underline" onClick={() => setEditingNotes(true)}>
              Edit
            </button>
          )}
        </p>
      ) : (
        canEdit && (
          <button type="button" className="cursor-pointer text-sm text-muted underline" onClick={() => setEditingNotes(true)}>
            + Add instructions
          </button>
        )
      )}

      {items.length > 0 && (
        <ul className="divide-y divide-border rounded-md border border-border">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={item.done}
                disabled={pending || !canTick}
                className="h-4 w-4 cursor-pointer"
                aria-label={item.text}
                onChange={(e) => run(() => toggleChecklistItem(item.id, e.target.checked))}
              />
              <span className={`flex-1 ${item.done ? "text-muted line-through" : ""}`}>{item.text}</span>
              {canEdit && (
                <button
                  type="button"
                  aria-label={`Remove ${item.text}`}
                  className="cursor-pointer text-muted hover:text-red-600"
                  disabled={pending}
                  onClick={() => run(() => removeChecklistItem(item.id))}
                >
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canEdit && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!text.trim()) return;
            run(() => addChecklistItem(taskId, text), () => setText(""));
          }}
        >
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Add a checklist item"
            className="input flex-1 text-foreground"
          />
          <button className="btn" disabled={pending || !text.trim()}>
            Add
          </button>
        </form>
      )}

      {items.length === 0 && !description && !canEdit && <p className="text-sm text-muted">No instructions for this task.</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </section>
  );
}
