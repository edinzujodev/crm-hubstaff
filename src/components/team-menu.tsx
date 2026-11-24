"use client";

import { Button } from "@/components/ui";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { deleteTeam } from "@/app/actions";
import { EditTeamForm, type TeamEditData } from "@/components/edit-team-form";
import type { PickerUser } from "@/components/member-picker";
import { HoldToDelete } from "@/components/hold-to-delete";
import { RowMenu } from "@/components/row-menu";
import { Modal } from "@/components/modal";

/** The ⋯ button at the end of a team row. Its menu has View, Edit and Delete (Delete asks for a press-and-hold). */
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
        <Modal title="Delete team?" onClose={() => setConfirm(false)}>
          <p className="text-sm">
            Delete <span className="font-medium">{name}</span>?
          </p>
          <div className="flex items-center justify-end gap-2">
            <Button type="button" severity="secondary" outlined onClick={() => setConfirm(false)}>
              Cancel
            </Button>
            <HoldToDelete title={name} action={() => deleteTeam(teamId)} />
          </div>
        </Modal>
      )}
    </>
  );
}
