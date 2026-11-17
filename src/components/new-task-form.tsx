"use client";

import { Button, InputText, InputTextarea, Select } from "@/components/ui";
import { SelectButton } from "primereact/selectbutton";
import { useActionState, useEffect, useRef, useState } from "react";
import { createTask } from "@/app/actions";
import { DateInput } from "@/components/date-input";
import { Modal } from "@/components/modal";
import { ProjectField, type ProjectOption } from "@/components/project-field";
import { RepeatShowFields } from "@/components/repeat-show-fields";
import { defaultLead, type RepeatShow } from "@/lib/repeat-show";
import type { TemplateOption } from "@/lib/templates";
import { notify } from "@/lib/toast";

type Option = { id: number; name: string };
type Repeat = "" | "weekly" | "monthly";

/** The "New task" button. It opens a popup with every field of a task, including how it repeats. */
export function NewTaskForm({
  clients,
  users,
  projects,
  templates = [],
}: {
  clients: Option[];
  users: Option[];
  projects: ProjectOption[];
  templates?: TemplateOption[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        + New task
      </Button>
      {open && (
        <Modal title="New task" wide onClose={() => setOpen(false)}>
          <TaskForm
            clients={clients}
            users={users}
            projects={projects}
            templates={templates}
            onDone={() => setOpen(false)}
          />
        </Modal>
      )}
    </>
  );
}

function TaskForm({
  clients,
  users,
  projects,
  templates,
  onDone,
}: {
  clients: Option[];
  users: Option[];
  projects: ProjectOption[];
  templates: TemplateOption[];
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState(createTask, null);
  const [title, setTitle] = useState("");
  const [clientId, setClientId] = useState("");
  const [due, setDue] = useState("");
  const [repeat, setRepeat] = useState<Repeat>("");
  const [show, setShow] = useState<RepeatShow>("days_before");
  const [lead, setLead] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [notes, setNotes] = useState("");
  const [checklist, setChecklist] = useState("");
  const hubstaffWarning = state?.ok ? state.data.hubstaffError : undefined;
  const titleRef = useRef(title);
  useEffect(() => {
    titleRef.current = title;
  });

  useEffect(() => {
    if (state?.ok) notify({ message: "Task created", detail: titleRef.current });
    if (state?.ok && !state.data.hubstaffError) onDone();
  }, [state, onDone]);

  // Picking a template fills in its instructions and checklist; both can still be edited for this task.
  function chooseTemplate(id: string) {
    setTemplateId(id);
    const t = templates.find((x) => String(x.id) === id);
    // "No template" empties the fields the previous template filled in.
    setNotes(t?.description ?? "");
    setChecklist(t ? t.items.join("\n") : "");
  }

  function chooseRepeat(value: Repeat) {
    setRepeat(value);
    setShow("days_before");
    setLead(value ? String(defaultLead(value)) : "");
  }

  return (
    <form action={action} className="space-y-4">
      <label className="flex flex-col gap-1 text-xs text-muted">
        Task
        <InputText
          name="title"
          required
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Monthly bank reconciliation"
          className="w-full text-foreground"
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
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
        <ProjectField clientId={clientId} title={title} projects={projects} />
        <label className="flex flex-col gap-1 text-xs text-muted">
          Assignee
          <Select name="assigneeId" defaultValue="" className="w-full text-foreground">
            <option value="">—</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Due date
          <DateInput
            name="dueDate"
            required
            value={due}
            onChange={(e) => {
              setDue(e.target.value);
              if (!e.target.value) chooseRepeat("");
            }}
          />
        </label>
      </div>

      <fieldset className="space-y-3 rounded-md border border-border p-3">
        <legend className="px-1 text-xs text-muted">Type of task</legend>
        <SelectButton
          value={repeat || "once"}
          options={[
            { label: "One-time", value: "once" },
            { label: "Weekly", value: "weekly", disabled: !due },
            { label: "Monthly", value: "monthly", disabled: !due },
          ]}
          optionLabel="label"
          optionValue="value"
          optionDisabled="disabled"
          allowEmpty={false}
          onChange={(e) => chooseRepeat(e.value === "once" ? "" : (e.value as Repeat))}
          aria-label="Type of task"
        />
        {repeat && (
          <>
            <p className="text-xs text-muted">
              The next one is created automatically, due one {repeat === "weekly" ? "week" : "month"} later, and shows
              up when its time comes, even if this one is not finished.
            </p>
            <RepeatShowFields repeat={repeat} show={show} lead={lead} onShow={setShow} onLead={setLead} />
          </>
        )}
        <input type="hidden" name="repeat" value={repeat} />
      </fieldset>

      <fieldset className="space-y-3 rounded-md border border-border p-3">
        <legend className="px-1 text-xs text-muted">How to do it (optional)</legend>
        {templates.length > 0 && (
          <label className="flex flex-col gap-1 text-xs text-muted">
            Template
            <Select
              value={templateId}
              onChange={(e) => chooseTemplate(e.target.value)}
              className="w-full text-foreground"
            >
              <option value="">No template</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </label>
        )}
        <input type="hidden" name="templateId" value={templateId} />
        <label className="flex flex-col gap-1 text-xs text-muted">
          Instructions
          <InputTextarea
            autoResize={false}
            style={{ width: "100%" }}
            name="description"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="What needs to be done"
            className="text-foreground"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Checklist, one item per line
          <InputTextarea
            autoResize={false}
            style={{ width: "100%" }}
            name="checklist"
            rows={4}
            value={checklist}
            onChange={(e) => setChecklist(e.target.value)}
            placeholder={"Collect the bank statements\nMatch every payment\nSend the report"}
            className="text-foreground"
          />
        </label>
        <p className="text-xs text-muted">
          The task can be finished without ticking every item; finishing ticks what is left.
        </p>
      </fieldset>

      {state && !state.ok && <p className="text-sm text-red-600">{state.error}</p>}
      {hubstaffWarning && (
        <p className="text-sm text-amber-700 dark:text-amber-400">
          Task saved, but it was not created in Hubstaff yet ({hubstaffWarning}). Start will try again.
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" severity="secondary" outlined onClick={onDone}>
          {hubstaffWarning ? "Close" : "Cancel"}
        </Button>
        {!hubstaffWarning && <Button disabled={pending}>{pending ? "Adding…" : "Add task"}</Button>}
      </div>
    </form>
  );
}
