"use client";

import { Button, InputText, InputTextarea } from "@/components/ui";
import { useActionState, useCallback, useEffect, useState } from "react";
import { createTemplate, deleteTemplate, updateTemplate } from "@/app/actions";
import { DataGrid } from "@/components/data-grid";
import { ConfirmDelete } from "@/components/confirm-delete";
import { Modal } from "@/components/modal";
import { RowMenu } from "@/components/row-menu";
import type { TemplateOption } from "@/lib/templates";

/** The templates list: instructions plus a checklist that a task can start from. Add, edit and delete. */
export function TemplateManager({ templates }: { templates: TemplateOption[] }) {
  const [modal, setModal] = useState<{ kind: "new" } | { kind: "edit" | "delete"; template: TemplateOption } | null>(
    null,
  );
  const close = useCallback(() => setModal(null), []);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-end gap-3">
        <Button type="button" onClick={() => setModal({ kind: "new" })}>
          + New template
        </Button>
      </div>

      <DataGrid
        empty="No templates yet. Create one for work you do again and again."
        headers={["Template", "Instructions", { label: "Checklist items", align: "right" }]}
        rows={templates.map((t) => ({
          key: t.id,
          cells: [
            <span key="n" className="font-medium">
              {t.name}
            </span>,
            <span key="d" className="text-muted">
              {t.description ? t.description.slice(0, 140) : "—"}
            </span>,
            <span key="i" className="font-mono tabular-nums">
              {t.items.length}
            </span>,
          ],
          actions: (
            <RowMenu
              label={`Actions for ${t.name}`}
              items={[
                { label: "Edit", onSelect: () => setModal({ kind: "edit", template: t }) },
                { label: "Delete", danger: true, onSelect: () => setModal({ kind: "delete", template: t }) },
              ]}
            />
          ),
        }))}
      />

      {modal?.kind === "new" && (
        <Modal title="New template" wide onClose={close}>
          <NewTemplate onDone={close} />
        </Modal>
      )}
      {modal?.kind === "edit" && (
        <Modal title="Edit template" wide onClose={close}>
          <EditTemplate template={modal.template} onDone={close} />
        </Modal>
      )}
      {modal?.kind === "delete" && (
        <ConfirmDelete
          title="Delete template?"
          what={modal.template.name}
          note="Tasks that already used it keep their own copy of the checklist."
          action={() => deleteTemplate(modal.template.id)}
          onClose={close}
        />
      )}
    </section>
  );
}

type FormState = { ok: boolean; error?: string } | null;

function TemplateForm({
  action,
  pending,
  state,
  template,
  submitLabel,
  onDone,
}: {
  action: (formData: FormData) => void;
  pending: boolean;
  state: FormState;
  template?: TemplateOption;
  submitLabel: string;
  onDone: () => void;
}) {
  return (
    <form action={action} className="space-y-3">
      <label className="flex flex-col gap-1 text-xs text-muted">
        Name
        <InputText
          name="name"
          required
          autoFocus
          maxLength={120}
          defaultValue={template?.name ?? ""}
          placeholder="e.g. Monthly bank reconciliation"
          className="w-full text-foreground"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Instructions
        <InputTextarea
          autoResize={false}
          style={{ width: "100%" }}
          name="description"
          rows={3}
          defaultValue={template?.description ?? ""}
          placeholder="What needs to be done, and how"
          className="text-foreground"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Checklist, one item per line
        <InputTextarea
          autoResize={false}
          style={{ width: "100%" }}
          name="items"
          rows={6}
          defaultValue={template?.items.join("\n") ?? ""}
          className="text-foreground"
        />
      </label>
      {state && !state.ok && <p className="text-sm text-red-600">{state.error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" severity="secondary" outlined onClick={onDone}>
          Cancel
        </Button>
        <Button disabled={pending}>{pending ? "Saving…" : submitLabel}</Button>
      </div>
    </form>
  );
}

function NewTemplate({ onDone }: { onDone: () => void }) {
  const [state, action, pending] = useActionState(createTemplate, null);
  useEffect(() => {
    if (state?.ok) onDone();
  }, [state, onDone]);
  return <TemplateForm action={action} pending={pending} state={state} submitLabel="Save" onDone={onDone} />;
}

function EditTemplate({ template, onDone }: { template: TemplateOption; onDone: () => void }) {
  const [state, action, pending] = useActionState(updateTemplate.bind(null, template.id), null);
  useEffect(() => {
    if (state?.ok) onDone();
  }, [state, onDone]);
  return (
    <TemplateForm
      action={action}
      pending={pending}
      state={state}
      template={template}
      submitLabel="Save"
      onDone={onDone}
    />
  );
}
