"use client";

import { Button } from "@/components/ui";
import { Message } from "primereact/message";
import { Slider } from "primereact/slider";
import { useActionState, useState } from "react";
import { setUrgencyLevels } from "@/app/actions";

const MAX_HOURS = 24 * 90;
/** The slider covers the first 30 days; longer levels are typed in. */
const SLIDER_MAX = 24 * 30;

/** 572 → "23d 20h", 48 → "2d", 5 → "5h". */
function long(hours: number) {
  if (hours < 48) return `${hours}h`;
  const d = Math.floor(hours / 24);
  const h = hours % 24;
  return h ? `${d}d ${h}h` : `${d}d`;
}

const ZONES = {
  critical: { label: "Critical", bar: "bg-red-500", text: "text-red-600 dark:text-red-400" },
  approaching: { label: "Approaching", bar: "bg-amber-500", text: "text-amber-700 dark:text-amber-400" },
  onTrack: { label: "On track", bar: "bg-emerald-500", text: "text-emerald-700 dark:text-emerald-400" },
};

function Zone({ zone, children }: { zone: keyof typeof ZONES; children: React.ReactNode }) {
  const z = ZONES[zone];
  return (
    <div className="flex gap-3 rounded-md border border-border p-3">
      <span aria-hidden className={`w-1 shrink-0 rounded-full ${z.bar}`} />
      <div>
        <p className={`text-sm font-semibold ${z.text}`}>{z.label}</p>
        <p className="text-sm text-muted">{children}</p>
      </div>
    </div>
  );
}

/** The two urgency levels for everyone, in hours until the due date. Saved by the super admin. */
export function UrgencyLevelsForm({
  approachingHours,
  criticalHours,
}: {
  approachingHours: number;
  criticalHours: number;
}) {
  const [state, action, pending] = useActionState(setUrgencyLevels, null);
  const [critical, setCritical] = useState<number | null>(criticalHours);
  const [approaching, setApproaching] = useState<number | null>(approachingHours);

  const c = critical ?? 0;
  const a = approaching ?? 0;
  const numbersOk = critical !== null && approaching !== null && c >= 1 && a >= 1;
  const orderOk = !numbersOk || c < a;
  const dirty = c !== criticalHours || a !== approachingHours;
  const canSave = numbersOk && orderOk && dirty && !pending;

  const cPct = (Math.min(c, SLIDER_MAX) / SLIDER_MAX) * 100;
  const aPct = (Math.min(a, SLIDER_MAX) / SLIDER_MAX) * 100;

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="criticalHours" value={c} />
      <input type="hidden" name="approachingHours" value={a} />

      <div className="space-y-2">
        <Slider
          range
          min={1}
          max={SLIDER_MAX}
          value={[Math.min(c || 1, SLIDER_MAX), Math.min(a || 1, SLIDER_MAX)]}
          onChange={(e) => {
            const [lo, hi] = e.value as [number, number];
            setCritical(lo);
            setApproaching(hi);
          }}
          aria-label="Critical and Approaching levels"
          className="urgency-slider"
          style={{
            background: `linear-gradient(to right, #ef4444 0 ${cPct}%, #f59e0b ${cPct}% ${aPct}%, #10b981 ${aPct}% 100%)`,
          }}
        />
        <div className="flex justify-between text-xs text-muted">
          <span>due now</span>
          <span>{long(SLIDER_MAX / 2)} before due</span>
          <span>{long(SLIDER_MAX)}+</span>
        </div>
      </div>

      {numbersOk && orderOk ? (
        <div aria-label="What the levels mean" className="grid gap-3 sm:grid-cols-3">
          <Zone zone="critical">Overdue, or less than {long(c)} left</Zone>
          <Zone zone="approaching">
            {long(c)} to {long(a)} left
          </Zone>
          <Zone zone="onTrack">More than {long(a)} left</Zone>
        </div>
      ) : (
        <Message
          severity="error"
          text={
            numbersOk
              ? "Critical has to be fewer hours than Approaching."
              : `Enter whole hours from 1 to ${MAX_HOURS} (90 days).`
          }
        />
      )}

      <div className="flex items-center gap-3">
        <Button disabled={!canSave}>{pending ? "Saving…" : "Save levels"}</Button>
        {!dirty && state?.ok && <span className="text-sm text-emerald-700 dark:text-emerald-400">✓ Saved</span>}
        {dirty && numbersOk && orderOk && <span className="text-xs text-muted">Unsaved changes</span>}
      </div>
      {state && !state.ok && <Message severity="error" text={state.error} />}
    </form>
  );
}
