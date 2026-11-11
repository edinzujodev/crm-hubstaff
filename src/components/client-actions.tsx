"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { deleteClient, updateClient } from "@/app/actions";
import { ConfirmDelete } from "@/components/confirm-delete";
import { Modal } from "@/components/modal";
import { RowMenu } from "@/components/row-menu";

export type ClientFields = {
  id: number;
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  hubstaffProjectId: number | null;
};

/** Edit / Delete for a client. `redirectTo` is where to go after deleting it from its own page. */
export function ClientActions({
  client,
  canDelete,
  redirectTo,
}: {
  client: ClientFields;
  canDelete: boolean;
  redirectTo?: string;
}) {
  const router = useRouter();
  const [modal, setModal] = useState<"edit" | "delete" | null>(null);
  return (
    <>
      <RowMenu
        label={`Actions for ${client.name}`}
        items={[
          { label: "Edit", onSelect: () => setModal("edit") },
          ...(canDelete ? [{ label: "Delete", danger: true, onSelect: () => setModal("delete") }] : []),
        ]}
      />
      {modal === "edit" && (
        <Modal title="Edit client" wide onClose={() => setModal(null)}>
          <EditClient client={client} onDone={() => setModal(null)} />
        </Modal>
      )}
      {modal === "delete" && (
        <ConfirmDelete
          title="Delete client?"
          what={client.name}
          note="Its projects are deleted with it. A client that has tasks can't be deleted."
          action={async () => {
            const res = await deleteClient(client.id);
            if (res.ok && redirectTo) router.push(redirectTo);
            return res;
          }}
          onClose={() => setModal(null)}
        />
      )}
    </>
  );
}

function EditClient({ client, onDone }: { client: ClientFields; onDone: () => void }) {
  const [state, action, pending] = useActionState(updateClient.bind(null, client.id), null);
  useEffect(() => {
    if (state?.ok) onDone();
  }, [state, onDone]);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <label className="flex flex-col gap-1 text-xs text-muted sm:col-span-2">
        Name
        <input name="name" required autoFocus defaultValue={client.name} className="input text-foreground" />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Contact
        <input name="contactName" defaultValue={client.contactName ?? ""} className="input text-foreground" />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Email
        <input name="email" type="email" defaultValue={client.email ?? ""} className="input text-foreground" />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Phone
        <input name="phone" defaultValue={client.phone ?? ""} className="input text-foreground" />
      </label>
      <label
        className="flex flex-col gap-1 text-xs text-muted"
        title="Optional. Overrides HUBSTAFF_PROJECT_ID for this client's tasks."
      >
        Hubstaff project id
        <input
          name="hubstaffProjectId"
          inputMode="numeric"
          defaultValue={client.hubstaffProjectId ?? ""}
          className="input font-mono text-foreground"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted sm:col-span-2">
        Notes
        <textarea name="notes" rows={3} defaultValue={client.notes ?? ""} className="input text-foreground" />
      </label>
      {state && !state.ok && <p className="text-sm text-red-600 sm:col-span-2">{state.error}</p>}
      <div className="flex justify-end gap-2 sm:col-span-2">
        <button type="button" className="btn" onClick={onDone}>
          Cancel
        </button>
        <button className="btn btn-primary" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}
