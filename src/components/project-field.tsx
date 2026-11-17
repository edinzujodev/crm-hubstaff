"use client";

import { InputText, Select } from "@/components/ui";
import { useState } from "react";
import { KIND_LABEL, type ProjectKind } from "@/lib/project-kind";

export type ProjectOption = { id: number; name: string; clientId: number; kind: ProjectKind };

const NEW = "new";

/**
 * Project picker for a task: a list of the client's projects, plus "New project…".
 * Picking "New project…" shows a name (which follows the task name until edited) and a type.
 */
export function ProjectField({
  clientId,
  title,
  projects,
  initialProjectId,
  className = "",
  lockedHint,
}: {
  /** When set, the project can't be changed and this text shows on hover. */
  lockedHint?: string;
  clientId: string;
  title: string;
  projects: ProjectOption[];
  /** Set when editing: the project the task is in now. */
  initialProjectId?: string;
  className?: string;
}) {
  const [choice, setChoice] = useState(initialProjectId ?? "");
  const [typed, setTyped] = useState<string | null>(null);
  const [kind, setKind] = useState<ProjectKind>("one_off");
  const mine = projects.filter((p) => String(p.clientId) === clientId);
  // A project that belongs to another client can't stay selected after the client changes.
  const selected = choice === NEW || mine.some((p) => String(p.id) === choice) ? choice : "";
  const creating = selected === NEW;
  const name = typed ?? title;
  const picked = mine.find((p) => String(p.id) === selected);

  return (
    <div className={`flex flex-col gap-1 text-xs text-muted ${className}`} title={lockedHint}>
      <label className="flex flex-col gap-1">
        Project
        <Select
          value={selected}
          required={!creating}
          disabled={!clientId || !!lockedHint}
          title={lockedHint}
          onChange={(e) => setChoice(e.target.value)}
          className="w-full text-foreground"
        >
          <option value="" disabled>
            {clientId ? "Select…" : "Pick a client first"}
          </option>
          {mine.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.kind === "ongoing" ? " (ongoing)" : ""}
            </option>
          ))}
          <option value={NEW}>+ New project…</option>
        </Select>
      </label>
      {/* The chosen existing project is what gets submitted; a new one is submitted by name and type. */}
      {selected && !creating && <input type="hidden" name="projectId" value={selected} />}
      {picked && <span>{KIND_LABEL[picked.kind]} project</span>}
      {creating && (
        <div className="flex flex-col gap-2 rounded-md border border-border p-2">
          <InputText
            name="projectName"
            required
            value={name}
            maxLength={120}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="Project name"
            aria-label="New project name"
            className="w-full text-foreground"
          />
          <Select
            name="projectKind"
            value={kind}
            onChange={(e) => setKind(e.target.value as ProjectKind)}
            aria-label="Project type"
            className="w-full text-foreground"
          >
            <option value="one_off">{KIND_LABEL.one_off} (has an end)</option>
            <option value="ongoing">{KIND_LABEL.ongoing} (continuous work)</option>
          </Select>
        </div>
      )}
    </div>
  );
}
