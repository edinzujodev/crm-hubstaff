"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/modal";
import type { ProjectOption } from "@/components/project-field";
import { RowMenu } from "@/components/row-menu";
import { EditForm, type Option, type TaskFields } from "@/components/task-menu";

/**
 * ⋯ menu for a recurring task. View opens the recurring task page (all copies, Stop repeating, Delete). Edit
 * changes the current copy (title, client, project, assignee, due date and how it repeats); every new copy is
 * made from it, so the change carries forward. Finished copies are untouched.
 */
export function SeriesMenu({
  seriesId,
  task,
  clients,
  users,
  projects,
}: {
  seriesId: number;
  task: TaskFields;
  clients: Option[];
  users: Option[];
  projects: ProjectOption[];
}) {
  const [editing, setEditing] = useState(false);
  const router = useRouter();
  const close = useCallback(() => setEditing(false), []);
  return (
    <>
      <RowMenu
        label={`Actions for ${task.title}`}
        items={[
          { label: "View", onSelect: () => router.push(`/recurring/${seriesId}`) },
          { label: "Edit", onSelect: () => setEditing(true) },
        ]}
      />
      {editing && (
        <Modal title="Edit recurring task" onClose={close}>
          <p className="mb-3 text-xs text-muted">
            Title and client change on every copy, past and future. Assignee and the repeat settings change on every
            copy that is not finished, and on the ones made later. The due date is this copy&apos;s; later copies follow it.
          </p>
          <EditForm task={task} clients={clients} users={users} projects={projects} onDone={close} series />
        </Modal>
      )}
    </>
  );
}
