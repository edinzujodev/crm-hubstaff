"use client";

import { useState } from "react";

export type PickerUser = { id: number; name: string; teamName: string | null };

/** A searchable checkbox list of people. Submits every checked person as `memberIds`. */
export function MemberPicker({ users, selected = [] }: { users: PickerUser[]; selected?: number[] }) {
  const [query, setQuery] = useState("");
  const [checked, setChecked] = useState(() => new Set(selected));
  const q = query.trim().toLowerCase();

  const toggle = (id: number) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  return (
    <div className="flex flex-col gap-1 text-xs text-muted">
      <div className="flex items-center justify-between">
        <span>Members</span>
        <span>{checked.size} selected</span>
      </div>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search people"
        aria-label="Search people"
        className="input text-foreground"
      />
      <div className="max-h-48 overflow-y-auto rounded-md border border-border">
        {users.map((u) => (
          <label
            key={u.id}
            className={`flex cursor-pointer items-center gap-2 border-b border-border px-3 py-1.5 text-sm text-foreground last:border-0 hover:bg-primary/5 ${
              q && !u.name.toLowerCase().includes(q) ? "hidden" : ""
            }`}
          >
            <input type="checkbox" name="memberIds" value={u.id} checked={checked.has(u.id)} onChange={() => toggle(u.id)} />
            <span className="flex-1">{u.name}</span>
            {u.teamName && checked.has(u.id) === false && <span className="text-xs text-muted">in {u.teamName}</span>}
          </label>
        ))}
        {users.length === 0 && <p className="px-3 py-4 text-center text-sm">No people yet.</p>}
      </div>
      <span>Someone can be in one team. Picking a person here moves them out of their current team.</span>
    </div>
  );
}
