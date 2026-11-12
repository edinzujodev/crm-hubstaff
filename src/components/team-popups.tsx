"use client";

import { useCallback, useState } from "react";
import { AddMemberForm } from "@/components/add-member-form";
import { EditTeamForm, type TeamEditData } from "@/components/edit-team-form";
import type { PickerUser } from "@/components/member-picker";
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

/** Edit button for a team's own page. */
export function EditTeamButton({ team, users }: { team: TeamEditData; users: PickerUser[] }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <button className="btn cursor-pointer" onClick={() => setOpen(true)}>
        Edit team
      </button>
      {open && (
        <Modal title="Edit team" onClose={close}>
          <EditTeamForm team={team} users={users} onDone={close} />
        </Modal>
      )}
    </>
  );
}

export function NewTeamButton({ users }: { users: PickerUser[] }) {
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
