"use client";

import { deleteTeam } from "@/app/actions";
import { HoldToDelete } from "@/components/hold-to-delete";

export function DeleteTeamButton({ teamId, title }: { teamId: number; title: string }) {
  return <HoldToDelete title={title} action={() => deleteTeam(teamId)} />;
}
