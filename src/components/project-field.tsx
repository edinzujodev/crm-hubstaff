"use client";

import { useId, useState } from "react";
import { KIND_LABEL, type ProjectKind } from "@/lib/project-kind";

export type ProjectOption = { id: number; name: string; clientId: number; kind: ProjectKind };

/**
 * Project picker for a task. Type to pick one of the client's projects or to start a new one.
 * Until it is touched it follows the task name, so the project fills itself in as the title is typed.
 */
export function ProjectField({
  clientId,
  title,
  projects,
  initialName,
  className = "",
}: {
  clientId: string;
  title: string;
  projects: ProjectOption[];
  /** Set when editing: starts as this project and does not follow the title. */
  initialName?: string;
  className?: string;
}) {
  const listId = useId();
  const [typed, setTyped] = useState<string | null>(initialName ?? null);
  const [kind, setKind] = useState<ProjectKind>("one_off");
  const value = typed ?? title;
  const mine = projects.filter((p) => String(p.clientId) === clientId);
  const match = mine.find((p) => p.name.toLowerCase() === value.trim().toLowerCase());
  const isNew = value.trim() !== "" && !match;

  return (
    <div className={`flex flex-col gap-1 text-xs text-muted ${className}`}>
      <label className="flex flex-col gap-1">
        Project
        <input
          name="projectName"
          list={listId}
          value={value}
          maxLength={120}
          onChange={(e) => setTyped(e.target.value)}
          placeholder="Defaults to the task name"
          className="input text-foreground"
        />
      </label>
      <datalist id={listId}>
        {mine.map((p) => (
          <option key={p.id} value={p.name} />
        ))}
      </datalist>
      {isNew ? (
        <span className="flex items-center gap-2">
          New project:
          <select
            name="projectKind"
            value={kind}
            onChange={(e) => setKind(e.target.value as ProjectKind)}
            aria-label="Project type"
            className="input py-0.5 text-foreground"
          >
            <option value="one_off">{KIND_LABEL.one_off} (has an end)</option>
            <option value="ongoing">{KIND_LABEL.ongoing} (continuous work)</option>
          </select>
        </span>
      ) : match ? (
        <span>Existing {KIND_LABEL[match.kind].toLowerCase()} project</span>
      ) : null}
    </div>
  );
}
