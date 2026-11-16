"use client";

import { Button } from "@/components/ui";
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
      <Button onClick={() => setOpen(true)}>+ Add member</Button>
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
      <Button severity="secondary" outlined onClick={() => setOpen(true)}>
        Edit team
      </Button>
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
      <Button onClick={() => setOpen(true)}>+ New team</Button>
      {open && (
        <Modal title="New team" onClose={close}>
          <NewTeamForm users={users} onDone={close} onCancel={close} />
        </Modal>
      )}
    </>
  );
}
