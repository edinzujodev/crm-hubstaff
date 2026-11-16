"use client";

import { Button, InputText, InputTextarea, Select } from "@/components/ui";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { deleteClient, updateClient } from "@/app/actions";
import { ConfirmDelete } from "@/components/confirm-delete";
import { Modal } from "@/components/modal";
import { RowMenu } from "@/components/row-menu";

export type ClientFields = {
  id: number;
  name: string;
  kind: "company" | "group";
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
        <InputText name="name" required autoFocus defaultValue={client.name} className="w-full text-foreground" />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Type
        <Select name="kind" defaultValue={client.kind} className="w-full text-foreground">
          <option value="company">Single company</option>
          <option value="group">Group of companies</option>
        </Select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Contact
        <InputText name="contactName" defaultValue={client.contactName ?? ""} className="w-full text-foreground" />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Email
        <InputText name="email" type="email" defaultValue={client.email ?? ""} className="w-full text-foreground" />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Phone
        <InputText name="phone" defaultValue={client.phone ?? ""} className="w-full text-foreground" />
      </label>
      <label
        className="flex flex-col gap-1 text-xs text-muted"
        title="Optional. Overrides HUBSTAFF_PROJECT_ID for this client's tasks."
      >
        Hubstaff project id
        <InputText
          name="hubstaffProjectId"
          inputMode="numeric"
          defaultValue={client.hubstaffProjectId ?? ""}
          className="w-full font-mono text-foreground"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted sm:col-span-2">
        Notes
        <InputTextarea autoResize={false} style={{ width: "100%" }} name="notes" rows={3} defaultValue={client.notes ?? ""} className="text-foreground" />
      </label>
      {state && !state.ok && <p className="text-sm text-red-600 sm:col-span-2">{state.error}</p>}
      <div className="flex justify-end gap-2 sm:col-span-2">
        <Button type="button"  severity="secondary" outlined onClick={onDone}>
          Cancel
        </Button>
        <Button  disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}
