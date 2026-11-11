"use client";

import { useActionState, useEffect, useState } from "react";
import { createCompany, deleteCompany, updateCompany } from "@/app/actions";
import { ConfirmDelete } from "@/components/confirm-delete";
import { Modal } from "@/components/modal";
import { RowMenu } from "@/components/row-menu";

type Company = { id: number; name: string; notes: string | null };

/** The companies of a group client, with add, edit and delete. */
export function CompanyList({ clientId, companies }: { clientId: number; companies: Company[] }) {
  const [modal, setModal] = useState<{ kind: "add" } | { kind: "edit" | "delete"; company: Company } | null>(null);
  const close = () => setModal(null);

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">Companies</h2>
        <button type="button" className="btn" onClick={() => setModal({ kind: "add" })}>
          + Add company
        </button>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-border text-left text-xs text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">Company</th>
              <th className="px-3 py-2 font-medium">Notes</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {companies.map((c) => (
              <tr key={c.id} className="border-b border-border last:border-0">
                <td className="px-3 py-2 font-medium">{c.name}</td>
                <td className="px-3 py-2 text-muted">{c.notes ?? "—"}</td>
                <td className="px-3 py-2">
                  <div className="flex justify-end">
                    <RowMenu
                      label={`Actions for ${c.name}`}
                      items={[
                        { label: "Edit", onSelect: () => setModal({ kind: "edit", company: c }) },
                        { label: "Delete", danger: true, onSelect: () => setModal({ kind: "delete", company: c }) },
                      ]}
                    />
                  </div>
                </td>
              </tr>
            ))}
            {companies.length === 0 && (
              <tr>
                <td colSpan={3} className="px-3 py-6 text-center text-muted">
                  No companies yet. Add the companies this group covers.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modal?.kind === "add" && (
        <Modal title="Add company" onClose={close}>
          <AddCompany clientId={clientId} onDone={close} />
        </Modal>
      )}
      {modal?.kind === "edit" && (
        <Modal title="Edit company" onClose={close}>
          <EditCompany company={modal.company} onDone={close} />
        </Modal>
      )}
      {modal?.kind === "delete" && (
        <ConfirmDelete
          title="Delete company?"
          what={modal.company.name}
          action={() => deleteCompany(modal.company.id)}
          onClose={close}
        />
      )}
    </section>
  );
}

type FormState = { ok: boolean; error?: string } | null;

function CompanyForm({
  action,
  pending,
  state,
  company,
  submitLabel,
  onDone,
}: {
  action: (formData: FormData) => void;
  pending: boolean;
  state: FormState;
  company?: Company;
  submitLabel: string;
  onDone: () => void;
}) {
  return (
    <form action={action} className="space-y-3">
      <label className="flex flex-col gap-1 text-xs text-muted">
        Name
        <input name="name" required autoFocus maxLength={120} defaultValue={company?.name ?? ""} className="input text-foreground" />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Notes
        <textarea name="notes" rows={2} defaultValue={company?.notes ?? ""} className="input text-foreground" />
      </label>
      {state && !state.ok && <p className="text-sm text-red-600">{state.error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn" onClick={onDone}>
          Cancel
        </button>
        <button className="btn btn-primary" disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}

function AddCompany({ clientId, onDone }: { clientId: number; onDone: () => void }) {
  const [state, action, pending] = useActionState(createCompany.bind(null, clientId), null);
  useEffect(() => {
    if (state?.ok) onDone();
  }, [state, onDone]);
  return <CompanyForm action={action} pending={pending} state={state} submitLabel="Add company" onDone={onDone} />;
}

function EditCompany({ company, onDone }: { company: Company; onDone: () => void }) {
  const [state, action, pending] = useActionState(updateCompany.bind(null, company.id), null);
  useEffect(() => {
    if (state?.ok) onDone();
  }, [state, onDone]);
  return <CompanyForm action={action} pending={pending} state={state} company={company} submitLabel="Save" onDone={onDone} />;
}
