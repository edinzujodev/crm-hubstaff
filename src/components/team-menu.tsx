"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { deleteTeam } from "@/app/actions";
import { EditTeamForm, type TeamEditData } from "@/components/edit-team-form";
import type { PickerUser } from "@/components/member-picker";
import { ConfirmDelete } from "@/components/confirm-delete";
import { RowMenu } from "@/components/row-menu";
import { Modal } from "@/components/modal";

/** The ⋯ button at the end of a team row. Its menu has View, Edit and Delete (Delete asks first). */
export function TeamMenu({
  teamId,
  name,
  team,
  users,
  canManage = true,
}: {
  teamId: number;
  name: string;
  team: TeamEditData;
  users: PickerUser[];
  /** False for a team leader: they can open the team but not edit or delete it. */
  canManage?: boolean;
}) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [editing, setEditing] = useState(false);
  const closeEdit = useCallback(() => setEditing(false), []);
  return (
    <>
      <RowMenu
        label={`Actions for ${name}`}
        items={[
          { label: "View", onSelect: () => router.push(`/hr/teams/${teamId}`) },
          ...(canManage
            ? [
                { label: "Edit", onSelect: () => setEditing(true) },
                { label: "Delete", danger: true, onSelect: () => setConfirm(true) },
              ]
            : []),
        ]}
      />
      {editing && (
        <Modal title="Edit team" onClose={closeEdit}>
          <EditTeamForm team={team} users={users} onDone={closeEdit} />
        </Modal>
      )}
      {confirm && (
        <ConfirmDelete
          title="Delete team?"
          what={name}
          note="Its members stay, without a team."
          action={() => deleteTeam(teamId)}
          onClose={() => setConfirm(false)}
        />
      )}
    </>
  );
}
