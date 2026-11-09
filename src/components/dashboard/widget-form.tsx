"use client";

import { useState } from "react";
import type { Role } from "@/lib/auth";
import { WIDGETS, parseConfig, type AnyConfig, type WidgetType } from "@/lib/dashboard/config";

export type Named = { id: number; name: string };
/** What the viewer may pick from, already narrowed to their role on the server. */
export type Lookups = { people: Named[]; teams: Named[]; clients: Named[] };

const labelClass = "flex flex-col gap-1 text-xs text-muted";
const idOrNull = (v: string) => (v ? Number(v) : null);

/** The settings of one widget. Used both when adding a widget and when changing it. */
export function WidgetForm({
  type,
  role,
  initial,
  initialTitle,
  lookups,
  submitLabel,
  pending,
  onSubmit,
  onCancel,
}: {
  type: WidgetType;
  role: Role;
  initial: AnyConfig;
  initialTitle: string | null;
  lookups: Lookups;
  submitLabel: string;
  pending: boolean;
  onSubmit: (config: AnyConfig, title: string | null) => void;
  onCancel: () => void;
}) {
  const def = WIDGETS[type];
  const [values, setValues] = useState<AnyConfig>(() => parseConfig(type, initial) as AnyConfig);
  const [title, setTitle] = useState(initialTitle ?? "");
  const set = (key: string, value: unknown) => setValues((prev) => ({ ...prev, [key]: value }));
  const who = String(values.who ?? "me");
  const needsPerson = def.fields.some((f) => f.kind === "who") && role !== "worker" && who === "person" && !values.userId;

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(values, title.trim() || null);
      }}
    >
      <label className={labelClass}>
        Title (optional)
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={80}
          placeholder="Leave empty for an automatic title"
          className="input text-foreground"
        />
      </label>

      {def.fields.map((f, i) => {
        if (f.kind === "who") {
          // Members only ever see their own data, so there is nothing to choose.
          if (role === "worker") return null;
          return (
            <div key={`who${i}`} className="space-y-3">
              <label className={labelClass}>
                Whose data
                <select value={who} onChange={(e) => set("who", e.target.value)} className="input text-foreground">
                  <option value="me">Me</option>
                  <option value="team">{role === "leader" ? "My team" : "A team"}</option>
                  <option value="person">A person</option>
                  {role === "super_admin" && <option value="everyone">Everyone</option>}
                </select>
              </label>
              {who === "person" && (
                <label className={labelClass}>
                  Person
                  <select
                    value={String(values.userId ?? "")}
                    onChange={(e) => set("userId", idOrNull(e.target.value))}
                    className="input text-foreground"
                    required
                  >
                    <option value="">Pick a person…</option>
                    {lookups.people.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {who === "team" && role === "super_admin" && (
                <label className={labelClass}>
                  Team
                  <select
                    value={String(values.teamId ?? "")}
                    onChange={(e) => set("teamId", idOrNull(e.target.value))}
                    className="input text-foreground"
                  >
                    <option value="">All teams</option>
                    {lookups.teams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          );
        }
        if (f.kind === "client") {
          if (lookups.clients.length === 0) return null;
          return (
            <label key={`client${i}`} className={labelClass}>
              {f.label}
              <select
                value={String(values.clientId ?? "")}
                onChange={(e) => set("clientId", idOrNull(e.target.value))}
                className="input text-foreground"
              >
                <option value="">All clients</option>
                {lookups.clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          );
        }
        if (f.kind === "team") {
          // A leader's widgets always cover their own team.
          if (role !== "super_admin") return null;
          return (
            <label key={`team${i}`} className={labelClass}>
              {f.label}
              <select
                value={String(values.teamId ?? "")}
                onChange={(e) => set("teamId", idOrNull(e.target.value))}
                className="input text-foreground"
              >
                <option value="">{f.empty}</option>
                {lookups.teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
          );
        }
        return (
          <label key={f.key} className={labelClass}>
            {f.label}
            <select
              value={String(values[f.key] ?? "")}
              onChange={(e) => set(f.key, f.number ? Number(e.target.value) : e.target.value)}
              className="input text-foreground"
            >
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        );
      })}

      {needsPerson && <p className="text-xs text-amber-700 dark:text-amber-400">Pick a person to show.</p>}

      <div className="flex justify-end gap-2 pt-1">
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn btn-primary" disabled={pending || needsPerson}>
          {pending ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
