"use client";

import { useCallback, useState } from "react";
import { AddMemberForm } from "@/components/add-member-form";
import { Modal } from "@/components/modal";
import { NewTeamForm } from "@/components/new-team-form";

export function AddMemberButton() {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <button className="btn btn-primary cursor-pointer" onClick={() => setOpen(true)}>
        + Add member
      </button>
      {open && (
        <Modal title="Add a member" onClose={close}>
          <AddMemberForm onDone={close} onCancel={close} />
        </Modal>
      )}
    </>
  );
}

export function NewTeamButton({ users }: { users: { id: number; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <button className="btn btn-primary cursor-pointer" onClick={() => setOpen(true)}>
        + New team
      </button>
      {open && (
        <Modal title="New team" onClose={close}>
          <NewTeamForm users={users} onDone={close} onCancel={close} />
        </Modal>
      )}
    </>
  );
}
