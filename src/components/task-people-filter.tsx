"use client";

import { Select } from "@/components/ui";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Narrow the task list to one team and one person in it. Someone who leads team leaders gets a team picker first
 * (each team is led by one of the leaders under them) and then picks a person from that team. A plain team leader
 * only picks a person from their team. The choice lives in the link (?team=…&person=…).
 */
export function TaskPeopleFilter({
  teams,
  people,
  team,
  person,
}: {
  /** Empty when there is only one team to pick from: the team picker is then left out. */
  teams: { id: number; label: string }[];
  /** The people to pick from: those of the chosen team, or of every team when none is chosen. */
  people: { id: number; name: string }[];
  team: number | null;
  person: number | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function go(next: { team?: number | null; person?: number | null }) {
    const q = new URLSearchParams(params.toString());
    // The saved My / Team / Unassigned choice does not apply while a team or person is picked.
    q.delete("scope");
    if ("team" in next) {
      if (next.team === null || next.team === undefined) q.delete("team");
      else q.set("team", String(next.team));
      // A person from another team no longer fits.
      q.delete("person");
    }
    if ("person" in next) {
      if (next.person === null || next.person === undefined) q.delete("person");
      else q.set("person", String(next.person));
    }
    router.replace(q.size ? `${pathname}?${q}` : pathname);
  }

  if (!people.length && !teams.length) return null;
  return (
    <>
      {teams.length > 0 && (
        <Select
          aria-label="Team"
          value={team === null ? "" : String(team)}
          onChange={(e) => go({ team: e.target.value ? Number(e.target.value) : null })}
          className="w-auto text-sm font-medium"
        >
          <option value="">All teams</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </Select>
      )}
      <Select
        aria-label="Person"
        value={person === null ? "" : String(person)}
        onChange={(e) => go({ person: e.target.value ? Number(e.target.value) : null })}
        className="w-auto text-sm font-medium"
      >
        <option value="">{team === null && teams.length > 0 ? "Everyone" : "Anyone"}</option>
        {people.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
          </option>
        ))}
      </Select>
    </>
  );
}
