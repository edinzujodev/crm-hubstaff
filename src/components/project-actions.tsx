"use client";

import { Button, InputText, Select } from "@/components/ui";
import { useActionState, useEffect, useState } from "react";
import { createProject, deleteProject, updateProject } from "@/app/actions";
import { ConfirmDelete } from "@/components/confirm-delete";
import { Modal } from "@/components/modal";
import { RowMenu } from "@/components/row-menu";
import { KIND_LABEL, type ProjectKind } from "@/lib/project-kind";

type Props = { id: number; name: string; kind: ProjectKind; tasks: number };

/** Edit / Delete for one project of a client. */
export function ProjectActions({ id, name, kind, tasks }: Props) {
  const [modal, setModal] = useState<"edit" | "delete" | null>(null);
  return (
    <>
      <RowMenu
        label={`Actions for ${name}`}
        items={[
          { label: "Edit", onSelect: () => setModal("edit") },
          { label: "Delete", danger: true, onSelect: () => setModal("delete") },
        ]}
      />
      {modal === "edit" && (
        <Modal title="Edit project" onClose={() => setModal(null)}>
          <EditProject id={id} name={name} kind={kind} onDone={() => setModal(null)} />
        </Modal>
      )}
      {modal === "delete" && (
        <ConfirmDelete
          title="Delete project?"
          what={name}
          note={
            tasks > 0
              ? `It has ${tasks} ${tasks === 1 ? "task" : "tasks"}, so it can't be deleted until they are moved to another project.`
              : undefined
          }
          action={() => deleteProject(id)}
          onClose={() => setModal(null)}
        />
      )}
    </>
  );
}

function ProjectForm({
  action,
  pending,
  state,
  name,
  kind,
  submitLabel,
  onDone,
}: {
  action: (formData: FormData) => void;
  pending: boolean;
  state: { ok: boolean; error?: string } | null;
  name: string;
  kind: ProjectKind;
  submitLabel: string;
  onDone: () => void;
}) {
  return (
    <form action={action} className="space-y-3">
      <label className="flex flex-col gap-1 text-xs text-muted">
        Name
        <InputText name="name" required autoFocus maxLength={120} defaultValue={name} className="w-full text-foreground" />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Type
        <Select name="kind" defaultValue={kind} className="w-full text-foreground">
          <option value="one_off">{KIND_LABEL.one_off} (has an end)</option>
          <option value="ongoing">{KIND_LABEL.ongoing} (continuous work)</option>
        </Select>
      </label>
      {state && !state.ok && <p className="text-sm text-red-600">{state.error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button"  severity="secondary" outlined onClick={onDone}>
          Cancel
        </Button>
        <Button  disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}

function EditProject({ id, name, kind, onDone }: { id: number; name: string; kind: ProjectKind; onDone: () => void }) {
  const [state, action, pending] = useActionState(updateProject.bind(null, id), null);
  useEffect(() => {
    if (state?.ok) onDone();
  }, [state, onDone]);
  return <ProjectForm action={action} pending={pending} state={state} name={name} kind={kind} submitLabel="Save" onDone={onDone} />;
}

/** "+ New project" for a client: a popup with a name and a type. */
export function NewProjectButton({ clientId }: { clientId: number }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button"  severity="secondary" outlined onClick={() => setOpen(true)}>
        + New project
      </Button>
      {open && (
        <Modal title="New project" onClose={() => setOpen(false)}>
          <CreateProject clientId={clientId} onDone={() => setOpen(false)} />
        </Modal>
      )}
    </>
  );
}

function CreateProject({ clientId, onDone }: { clientId: number; onDone: () => void }) {
  const [state, action, pending] = useActionState(createProject.bind(null, clientId), null);
  useEffect(() => {
    if (state?.ok) onDone();
  }, [state, onDone]);
  return <ProjectForm action={action} pending={pending} state={state} name="" kind="one_off" submitLabel="Add project" onDone={onDone} />;
}
