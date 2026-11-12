"use client";

import { useCallback, useState, useTransition } from "react";
import { stopRepeating } from "@/app/actions";
import { Modal } from "@/components/modal";
import type { ProjectOption } from "@/components/project-field";
import { RowMenu } from "@/components/row-menu";
import { EditForm, type Option, type TaskFields } from "@/components/task-menu";

/**
 * ⋯ menu for a recurring task. Edit changes the current copy (title, client, project, assignee, due date and
 * how it repeats); every new copy is made from it, so the change carries forward. Finished copies are untouched.
 */
export function SeriesMenu({
  task,
  clients,
  users,
  projects,
}: {
  task: TaskFields;
  clients: Option[];
  users: Option[];
  projects: ProjectOption[];
}) {
  const [editing, setEditing] = useState(false);
  const [, startTransition] = useTransition();
  const close = useCallback(() => setEditing(false), []);
  return (
    <>
      <RowMenu
        label={`Actions for ${task.title}`}
        items={[
          { label: "Edit", onSelect: () => setEditing(true) },
          ...(task.repeat
            ? [{ label: "Stop repeating", danger: true, onSelect: () => startTransition(async () => void (await stopRepeating(task.id))) }]
            : []),
        ]}
      />
      {editing && (
        <Modal title="Edit recurring task" onClose={close}>
          <p className="mb-3 text-xs text-muted">
            Applies to the current copy and every copy made after it. Finished copies stay as they were.
          </p>
          <EditForm task={task} clients={clients} users={users} projects={projects} onDone={close} />
        </Modal>
      )}
    </>
  );
}
