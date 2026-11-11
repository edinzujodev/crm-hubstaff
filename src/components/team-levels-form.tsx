"use client";

import { useActionState, useState } from "react";
import { setTeamLevels } from "@/app/actions";

const MAX_HOURS = 24 * 90;

/** 572 → "23d 20h", 48 → "2d", 5 → "5h". */
function long(hours: number) {
  if (hours < 48) return `${hours}h`;
  const d = Math.floor(hours / 24);
  const h = hours % 24;
  return h ? `${d}d ${h}h` : `${d}d`;
}

function HoursField({
  name,
  badge,
  badgeClass,
  value,
  onChange,
  presets,
  invalid,
}: {
  name: string;
  badge: string;
  badgeClass: string;
  value: string;
  onChange: (v: string) => void;
  presets: number[];
  invalid: boolean;
}) {
  const n = Number(value);
  const valid = Number.isInteger(n) && n >= 1;
  return (
    <div className="space-y-2">
      <label className="flex flex-col gap-1.5">
        <span className={`badge w-fit ${badgeClass}`}>{badge}</span>
        <span className="flex items-center gap-2 text-sm">
          <span className="text-muted">under</span>
          <input
            name={name}
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_HOURS}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            aria-invalid={invalid || !valid}
            className={`input w-24 text-center ${invalid || !valid ? "border-red-500" : ""}`}
          />
          <span className="text-muted">hours</span>
          {valid && n >= 48 && <span className="text-xs text-muted">= {long(n)}</span>}
        </span>
      </label>
      <div className="flex flex-wrap gap-1.5">
        {presets.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onChange(String(p))}
            aria-pressed={n === p}
            className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
              n === p
                ? "border-transparent bg-primary font-medium text-(--primary-fg)"
                : "border-border text-muted hover:border-primary/50 hover:bg-primary/10 hover:text-foreground"
            }`}
          >
            {long(p)}
          </button>
        ))}
      </div>
    </div>
  );
}

/** The two urgency levels of a team, in hours until the due date. Saved by the team leader. */
export function TeamLevelsForm({
  teamId,
  approachingHours,
  criticalHours,
}: {
  teamId: number;
  approachingHours: number;
  criticalHours: number;
}) {
  const [state, action, pending] = useActionState(setTeamLevels.bind(null, teamId), null);
  const [approaching, setApproaching] = useState(String(approachingHours));
  const [critical, setCritical] = useState(String(criticalHours));

  const a = Number(approaching);
  const c = Number(critical);
  const numbersOk = Number.isInteger(a) && Number.isInteger(c) && a >= 1 && c >= 1 && a <= MAX_HOURS && c <= MAX_HOURS;
  const orderOk = !numbersOk || c < a;
  const dirty = a !== approachingHours || c !== criticalHours;
  const canSave = numbersOk && orderOk && dirty && !pending;

  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-5 sm:grid-cols-2">
        <HoursField
          name="criticalHours"
          badge="Critical"
          badgeClass="border-red-500/60 text-red-700 dark:text-red-400"
          value={critical}
          onChange={setCritical}
          presets={[12, 24, 48]}
          invalid={!orderOk}
        />
        <HoursField
          name="approachingHours"
          badge="Approaching"
          badgeClass="border-amber-500/60 text-amber-700 dark:text-amber-400"
          value={approaching}
          onChange={setApproaching}
          presets={[48, 72, 168, 336]}
          invalid={!orderOk}
        />
      </div>

      {numbersOk && orderOk ? (
        <p className="rounded-md bg-black/[0.03] px-3 py-2 text-sm dark:bg-white/[0.05]">
          A task is <b className="text-red-700 dark:text-red-400">Critical</b> when it is overdue or due within{" "}
          <b>{long(c)}</b>, <b className="text-amber-700 dark:text-amber-400">Approaching</b> within <b>{long(a)}</b>, and
          on track after that.
        </p>
      ) : (
        <p role="alert" className="text-sm text-red-600">
          {numbersOk
            ? "Critical has to be fewer hours than Approaching."
            : `Enter whole hours from 1 to ${MAX_HOURS} (90 days).`}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button className="btn btn-primary" disabled={!canSave}>
          {pending ? "Saving…" : "Save levels"}
        </button>
        {!dirty && state?.ok && <span className="text-sm text-emerald-700 dark:text-emerald-400">✓ Saved</span>}
        {dirty && numbersOk && orderOk && <span className="text-xs text-muted">Unsaved changes</span>}
      </div>
      {state && !state.ok && <p className="text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
