"use client";

import { useActionState, useEffect, useState } from "react";
import { createTask } from "@/app/actions";
import { DateInput } from "@/components/date-input";
import { Modal } from "@/components/modal";
import { ProjectField, type ProjectOption } from "@/components/project-field";
import { RepeatShowFields } from "@/components/repeat-show-fields";
import { defaultLead, type RepeatShow } from "@/lib/repeat-show";
import type { TemplateOption } from "@/lib/templates";

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
      <button type="button" className="btn btn-primary h-8 py-0" onClick={() => setOpen(true)}>
        + New task
      </button>
      {open && (
        <Modal title="New task" wide onClose={() => setOpen(false)}>
          <TaskForm clients={clients} users={users} projects={projects} templates={templates} onDone={() => setOpen(false)} />
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

  useEffect(() => {
    if (state?.ok && !state.data.hubstaffError) onDone();
  }, [state, onDone]);

  // Picking a template fills in its instructions and checklist; both can still be edited for this task.
  function chooseTemplate(id: string) {
    setTemplateId(id);
    const t = templates.find((x) => String(x.id) === id);
    if (!t) return;
    setNotes(t.description ?? "");
    setChecklist(t.items.join("\n"));
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
        <input
          name="title"
          required
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Monthly bank reconciliation"
          className="input text-foreground"
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-muted">
          Client
          <select
            name="clientId"
            required
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="input text-foreground"
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
        <ProjectField clientId={clientId} title={title} projects={projects} />
        <label className="flex flex-col gap-1 text-xs text-muted">
          Assignee
          <select name="assigneeId" defaultValue="" className="input text-foreground">
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
          <DateInput
            name="dueDate"
            value={due}
            onChange={(e) => {
              setDue(e.target.value);
              if (!e.target.value) chooseRepeat("");
            }}
          />
        </label>
      </div>

      <fieldset className="space-y-3 rounded-md border border-border p-3">
        <legend className="px-1 text-xs text-muted">Repeats</legend>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["", "One-time"],
              ["weekly", "Weekly"],
              ["monthly", "Monthly"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              disabled={value !== "" && !due}
              onClick={() => chooseRepeat(value)}
              aria-pressed={repeat === value}
              className={`btn ${repeat === value ? "btn-primary" : ""}`}
            >
              {label}
            </button>
          ))}
        </div>
        {!due && <p className="text-xs text-muted">Set a due date to make it repeat.</p>}
        {repeat && (
          <>
            <p className="text-xs text-muted">
              The next one is created automatically, due one {repeat === "weekly" ? "week" : "month"} later, and shows up
              when its time comes, even if this one is not finished.
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
            <select
              value={templateId}
              onChange={(e) => chooseTemplate(e.target.value)}
              className="input text-foreground"
            >
              <option value="">No template</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <input type="hidden" name="templateId" value={templateId} />
        <label className="flex flex-col gap-1 text-xs text-muted">
          Instructions
          <textarea
            name="description"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="What needs to be done"
            className="input text-foreground"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Checklist, one item per line
          <textarea
            name="checklist"
            rows={4}
            value={checklist}
            onChange={(e) => setChecklist(e.target.value)}
            placeholder={"Collect the bank statements\nMatch every payment\nSend the report"}
            className="input text-foreground"
          />
        </label>
        <p className="text-xs text-muted">The task can be finished without ticking every item; finishing ticks what is left.</p>
      </fieldset>

      {state && !state.ok && <p className="text-sm text-red-600">{state.error}</p>}
      {hubstaffWarning && (
        <p className="text-sm text-amber-700 dark:text-amber-400">
          Task saved, but it was not created in Hubstaff yet ({hubstaffWarning}). Start will try again.
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn" onClick={onDone}>
          {hubstaffWarning ? "Close" : "Cancel"}
        </button>
        {!hubstaffWarning && (
          <button className="btn btn-primary" disabled={pending}>
            {pending ? "Adding…" : "Add task"}
          </button>
        )}
      </div>
    </form>
  );
}
