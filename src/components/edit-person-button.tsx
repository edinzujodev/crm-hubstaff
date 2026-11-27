"use client";

import { useActionState, useCallback, useEffect, useState } from "react";
import { updateUser } from "@/app/actions";
import { DateInput } from "@/components/date-input";
import { Modal } from "@/components/modal";
import { Button, InputText, Select } from "@/components/ui";
import { notify } from "@/lib/toast";

export type EditablePerson = {
  id: number;
  name: string;
  email: string;
  teamId: number | null;
  role: "super_admin" | "member";
  hubstaffUserId: number | null;
  jobTitle: string | null;
  startedOn: string | null;
  isLeader: boolean;
};

type Teams = { id: number; name: string }[];

/** `full`: a super admin, who also changes the email, team and role. A team lead sees those read-only. */
function EditPersonForm({ person, teams, full, onDone }: { person: EditablePerson; teams: Teams; full: boolean; onDone: () => void }) {
  const [state, action, pending] = useActionState(updateUser.bind(null, person.id), null);
  const [startedOn, setStartedOn] = useState(person.startedOn ?? "");
  const [teamId, setTeamId] = useState(person.teamId === null ? "" : String(person.teamId));
  useEffect(() => {
    if (!state?.ok) return;
    notify({ message: `${person.name} saved` });
    onDone();
  }, [state, onDone, person.name]);
  const field = "flex flex-col gap-1 text-xs font-medium text-muted";
  // A leader who moves to another team (or none) stops leading their team.
  const leavesLead = full && person.isLeader && teamId !== (person.teamId === null ? "" : String(person.teamId));

  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={field}>
          Name
          <InputText name="name" required autoFocus defaultValue={person.name} className="w-full text-foreground" />
        </label>
        <label className={field}>
          Job title
          <InputText name="jobTitle" defaultValue={person.jobTitle ?? ""} placeholder="Optional" className="w-full text-foreground" />
        </label>
      </div>
      {full ? (
        <>
          <label className={field}>
            Email
            <InputText name="email" type="email" required defaultValue={person.email} className="w-full text-foreground" />
            <span className="font-normal">They sign in with this Google account.</span>
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={field}>
              Team
              <Select name="teamId" value={teamId} onChange={(e) => setTeamId(e.target.value)} className="w-full text-foreground">
                <option value="">No team</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </label>
            <label className={field}>
              Role
              <Select name="role" defaultValue={person.role} className="w-full text-foreground">
                <option value="member">Staff</option>
                <option value="super_admin">Super admin</option>
              </Select>
            </label>
          </div>
        </>
      ) : (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg bg-foreground/[0.03] px-3 py-2.5 text-sm">
          <div className="col-span-2 min-w-0">
            <dt className="text-xs text-muted">Email</dt>
            <dd className="truncate">{person.email}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Team</dt>
            <dd>{teams.find((t) => t.id === person.teamId)?.name ?? "No team"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Role</dt>
            <dd>{person.isLeader ? "Team lead" : person.role === "super_admin" ? "Super admin" : "Staff"}</dd>
          </div>
          <p className="col-span-2 text-xs text-muted">Email, team and role are changed by a super admin.</p>
        </dl>
      )}
      {leavesLead && (
        <p className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
          {person.name} leads their current team. Moving them stops them leading it.
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={field}>
          Hubstaff user id
          <InputText
            name="hubstaffUserId"
            inputMode="numeric"
            defaultValue={person.hubstaffUserId ?? ""}
            placeholder="Not set"
            className="w-full font-mono text-foreground"
          />
        </label>
        <label className={field}>
          Start date
          <DateInput name="startedOn" value={startedOn} onChange={(e) => setStartedOn(e.target.value)} className="w-full" />
        </label>
      </div>
      {state && !state.ok && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" severity="secondary" outlined onClick={onDone}>
          Cancel
        </Button>
        <Button disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
      </div>
    </form>
  );
}

/** Pencil in a person's row: opens their details to edit in a popup. */
export function EditPersonButton({ person, teams, full }: { person: EditablePerson; teams: Teams; full: boolean }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <Button size="small" text icon="pi pi-pencil" aria-label={`Edit ${person.name}`} title="Edit" onClick={() => setOpen(true)} />
      {open && (
        <Modal title={`Edit ${person.name}`} onClose={close}>
          <EditPersonForm person={person} teams={teams} full={full} onDone={close} />
        </Modal>
      )}
    </>
  );
}
