"use client";

import { Button, Checkbox, InputText, InputTextarea } from "@/components/ui";
import { useState, useTransition } from "react";
import {
  addChecklistItem,
  removeChecklistItem,
  setTaskInstructions,
  toggleChecklistItem,
} from "@/app/actions";

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
  template,
}: {
  taskId: number;
  description: string | null;
  items: ChecklistItem[];
  canEdit: boolean;
  canTick: boolean;
  /** A recurring task's setup, not a list to work through: no ticking or progress, and edits reach every new copy. */
  template?: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [notes, setNotes] = useState(description ?? "");
  const [editingNotes, setEditingNotes] = useState(false);
  const doneCount = items.filter((i) => i.done).length;

  const run = (
    fn: () => Promise<{ ok: boolean; error?: string }>,
    after?: () => void,
  ) =>
    start(async () => {
      const res = await fn();
      setError(res.ok ? null : (res.error ?? "Something went wrong"));
      if (res.ok) after?.();
    });

  return (
    <div className="space-y-4">
      {(description || canEdit) && (
        <section className="card space-y-2 p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold">Instructions</h2>
            {canEdit && !editingNotes && (
              <Button
                type="button"
                link
                size="small"
                className="p-0 text-xs"
                onClick={() => setEditingNotes(true)}
              >
                {description ? "Edit" : "+ Add instructions"}
              </Button>
            )}
          </div>
          {editingNotes ? (
            <div className="space-y-2">
              <InputTextarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                autoFocus
                placeholder="What needs to be done, and how"
                className="w-full text-foreground"
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    run(
                      () => setTaskInstructions(taskId, notes),
                      () => setEditingNotes(false),
                    )
                  }
                >
                  Save
                </Button>
                <Button
                  type="button"
                  severity="secondary"
                  outlined
                  onClick={() => (
                    setNotes(description ?? ""),
                    setEditingNotes(false)
                  )}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : description ? (
            <p className="whitespace-pre-wrap text-sm leading-relaxed">
              {description}
            </p>
          ) : (
            <p className="text-sm text-muted">No instructions for this task.</p>
          )}
        </section>
      )}

      {(items.length > 0 || canEdit) && (
        <section className="card space-y-3 p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold">Checklist</h2>
            {items.length > 0 && !template && (
              <span className="text-sm text-muted">
                <span className="font-mono tabular-nums">
                  {doneCount}/{items.length}
                </span>{" "}
                checked
              </span>
            )}
          </div>
          {template && (
            <p className="text-sm text-muted">
              These steps are added to every occurrence. Each occurrence has its
              own copy to tick off.
            </p>
          )}
          {items.length > 0 && !template && (
            <div
              className="h-1.5 overflow-hidden rounded-full bg-border"
              aria-hidden
            >
              <div
                className="h-full rounded-full bg-emerald-600 transition-all"
                style={{ width: `${(doneCount / items.length) * 100}%` }}
              />
            </div>
          )}
          {items.length > 0 && (
            <ul className="divide-y divide-border rounded-md border border-border">
              {items.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center gap-3 px-3 py-2 text-sm"
                >
                  <label
                    className={`flex flex-1 items-center gap-3 ${canTick ? "cursor-pointer" : ""}`}
                  >
                    {!template && (
                      <Checkbox
                        checked={item.done}
                        disabled={pending || !canTick}
                        className="h-4 w-4 cursor-pointer"
                        aria-label={item.text}
                        onChange={(e) =>
                          run(() =>
                            toggleChecklistItem(item.id, e.target.checked),
                          )
                        }
                      />
                    )}
                    {template && (
                      <i
                        aria-hidden
                        className="pi pi-circle text-[0.4rem] text-muted"
                      />
                    )}
                    <span
                      className={
                        item.done && !template ? "text-muted line-through" : ""
                      }
                    >
                      {item.text}
                    </span>
                  </label>
                  {canEdit && (
                    <Button
                      type="button"
                      icon="pi pi-times"
                      text
                      rounded
                      size="small"
                      severity="danger"
                      aria-label={`Remove ${item.text}`}
                      disabled={pending}
                      onClick={() => run(() => removeChecklistItem(item.id))}
                    />
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
                run(
                  () => addChecklistItem(taskId, text),
                  () => setText(""),
                );
              }}
            >
              <InputText
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Add a checklist item"
                className="w-full flex-1 text-foreground"
              />
              <Button
                severity="secondary"
                outlined
                disabled={pending || !text.trim()}
              >
                Add
              </Button>
            </form>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}
        </section>
      )}
    </div>
  );
}
