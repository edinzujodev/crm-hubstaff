"use client";

import { Button, InputText, Select } from "@/components/ui";
import { useRouter } from "next/navigation";
import { SelectButton } from "primereact/selectbutton";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";import { deleteTask, setBlocked, updateTask } from "@/app/actions";
import { BlockModal } from "@/components/block-task";
import { DateInput } from "@/components/date-input";
import { RowMenu } from "@/components/row-menu";
import { Modal } from "@/components/modal";
import { RepeatShowFields } from "@/components/repeat-show-fields";
import { defaultLead, type RepeatShow } from "@/lib/repeat-show";
import { ProjectField, type ProjectOption } from "@/components/project-field";
import { truncate } from "@/lib/format";
import { notify } from "@/lib/toast";

export type Option = { id: number; name: string };
export type TaskFields = {
  id: number;
  title: string;
  clientId: number | null;
  projectId: number | null;
  assigneeId: number | null;
  dueDate: string | null;
  repeat: "weekly" | "monthly" | null;
  repeatLeadDays: number | null;
  repeatShow: RepeatShow | null;
  /** Set for repeating tasks: the menu then links to the recurring task page. */
  seriesId?: number | null;
  blocked?: boolean;
  /** How the task is named in popups and toasts (client and period included). Defaults to the title. */
  label?: string;
};

/** The ⋯ button at the end of a row, with Edit and Delete. Both open a popup. */
export function TaskMenu({
  task,
  clients,
  users,
  projects,
  canManage = true,
}: {
  canManage?: boolean;
  task: TaskFields;
  clients: Option[];
  users: Option[];
  projects: ProjectOption[];
}) {
  const [modal, setModal] = useState<"edit" | "delete" | "block" | null>(null);
  const router = useRouter();
  const [, startTransition] = useTransition();

  return (
    <>
      <RowMenu
        label={`Actions for ${task.label ?? task.title}`}
        items={[
          { label: "View", onSelect: () => router.push(`/tasks/${task.id}`) },
          task.blocked
            ? {
                label: "Unblock",
                icon: "pi pi-lock-open",
                onSelect: () =>
                  startTransition(async () => {
                    const res = await setBlocked(task.id, false);
                    if (res.ok) notify({ message: "Task unblocked", detail: task.label ?? task.title });
                  }),
              }
            : { label: "Mark as blocked", icon: "pi pi-ban", onSelect: () => setModal("block" as const) },
          ...(canManage
            ? [
                { label: "Edit", onSelect: () => setModal("edit" as const) },
                { label: "Delete", danger: true, onSelect: () => setModal("delete" as const) },
              ]
            : []),
        ]}
      />
      {modal === "edit" && (
        <Modal title="Edit task" onClose={() => setModal(null)}>
          <EditForm task={task} clients={clients} users={users} projects={projects} onDone={() => setModal(null)} />
        </Modal>
      )}
      {modal === "block" && <BlockModal taskId={task.id} title={task.label ?? task.title} onDone={() => setModal(null)} />}
      {modal === "delete" && (
        <Modal title="Delete task?" onClose={() => setModal(null)}>
          <DeleteConfirm task={task} onDone={() => setModal(null)} />
        </Modal>
      )}
    </>
  );
}

export function EditForm({
  task,
  clients,
  users,
  projects,
  onDone,
}: {
  task: TaskFields;
  clients: Option[];
  users: Option[];
  projects: ProjectOption[];
  onDone: () => void;
}) {
  const [clientId, setClientId] = useState(task.clientId ? String(task.clientId) : "");
  const [due, setDue] = useState(task.dueDate ?? "");
  const [repeat, setRepeat] = useState<"" | "weekly" | "monthly">(task.repeat ?? "");
  const [show, setShow] = useState<RepeatShow>(task.repeatShow ?? "days_before");
  const [lead, setLead] = useState(task.repeatLeadDays !== null ? String(task.repeatLeadDays) : "");
  const [state, action, pending] = useActionState(updateTask.bind(null, task.id), null);
  const hubstaffWarning = state?.ok ? state.data.hubstaffError : undefined;
  const titleRef = useRef(task.label ?? task.title);
  useEffect(() => {
    titleRef.current = task.label ?? task.title;
  });

  useEffect(() => {
    if (state?.ok) notify({ message: "Task updated", detail: titleRef.current });
    if (state?.ok && !state.data.hubstaffError) onDone();
  }, [state, onDone]);

  return (
    <form action={action} className="space-y-3">
      <label className="flex flex-col gap-1 text-xs text-muted">
        Title
        <InputText name="title" required defaultValue={task.title} className="w-full text-foreground" />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-xs text-muted">
          Client
          <Select
            name="clientId"
            required
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="w-full text-foreground"
          >
            <option value="" disabled>
              Select…
            </option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </label>
        <ProjectField
          key={clientId}
          clientId={clientId}
          title=""
          projects={projects}
          initialProjectId={clientId === String(task.clientId) && task.projectId ? String(task.projectId) : ""}
        />
        <label className="flex flex-col gap-1 text-xs text-muted">
          Assignee
          <Select name="assigneeId" defaultValue={task.assigneeId ?? ""} className="w-full text-foreground">
            <option value="">—</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Due
          <DateInput name="dueDate" value={due} onChange={(e) => setDue(e.target.value)} />
        </label>
        <div className="col-span-2 flex flex-col gap-1 text-xs text-muted">
          Type of task
          <SelectButton
            value={repeat || "once"}
            options={[
              { label: "One-time", value: "once" },
              { label: "Weekly", value: "weekly" },
              { label: "Monthly", value: "monthly" },
            ]}
            optionLabel="label"
            optionValue="value"
            allowEmpty={false}
            onChange={(e) => {
              const v = (e.value === "once" ? "" : e.value) as "" | "weekly" | "monthly";
              setRepeat(v);
              if (v && !lead) setLead(String(defaultLead(v)));
            }}
            aria-label="Type of task"
          />
          <input type="hidden" name="repeat" value={repeat} />
        </div>
        {repeat && (
          <div className="col-span-2">
            <RepeatShowFields repeat={repeat} show={show} lead={lead} onShow={setShow} onLead={setLead} />
          </div>
        )}
      </div>
      {state && !state.ok && <p className="text-sm text-red-600">{state.error}</p>}
      {hubstaffWarning && (
        <p className="text-sm text-amber-700 dark:text-amber-400">
          Saved, but the Hubstaff task was not renamed ({hubstaffWarning}).
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" severity="secondary" outlined onClick={onDone}>
          {hubstaffWarning ? "Close" : "Cancel"}
        </Button>
        {!hubstaffWarning && <Button disabled={pending}>{pending ? "Saving…" : "Save"}</Button>}
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
      notify({ message: "Task deleted", detail: task.label ?? task.title, link: { href: "/tasks?show=deleted", label: "Open Deleted" } });
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
          <Button severity="secondary" outlined onClick={onDone}>
            Close
          </Button>
        </div>
      </div>
    );

  return (
    <div className="space-y-3">
      <p className="text-sm">
        Delete <span className="font-medium">{truncate(task.label ?? task.title, 60)}</span>?
      </p>
      <p className="text-sm text-muted">
        It is hidden from the task list and any running timer on it is stopped. Its hours are left out of the reports, and you can
        restore it from the Deleted tab.
      </p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" severity="secondary" outlined onClick={onDone} disabled={pending}>
          Cancel
        </Button>
        <Button type="button" severity="danger" onClick={onDelete} disabled={pending}>
          {pending ? "Deleting…" : "Delete"}
        </Button>
      </div>
    </div>
  );
}
