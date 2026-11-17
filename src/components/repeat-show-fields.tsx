"use client";

import { InputText, Select } from "@/components/ui";
import { REPEAT_SHOW_LABEL, REPEAT_SHOW_OPTIONS, type RepeatShow, defaultLead } from "@/lib/repeat-show";

/** "When should each new copy show up in my list?" for a weekly or monthly task. */
export function RepeatShowFields({
  repeat,
  show,
  lead,
  onShow,
  onLead,
  lockedHint,
}: {
  repeat: "weekly" | "monthly";
  show: RepeatShow;
  lead: string;
  onShow: (v: RepeatShow) => void;
  onLead: (v: string) => void;
  /** When set, the fields are read-only and this text shows on hover. */
  lockedHint?: string;
}) {
  const options = REPEAT_SHOW_OPTIONS[repeat];
  // A choice that doesn't exist for this repeat (monthly start after switching to weekly) falls back.
  const current = options.includes(show) ? show : "days_before";
  const locked = !!lockedHint;
  return (
    <div className="space-y-2" title={lockedHint}>
      {/* Disabled fields are not submitted, so a locked form sends the values as hidden fields. */}
      {locked && <input type="hidden" name="repeatShow" value={current} />}
      {locked && current === "days_before" && <input type="hidden" name="repeatLeadDays" value={lead} />}
      <label className="flex flex-col gap-1 text-xs text-muted">
        Show each new one in my list
        <Select
          name={locked ? undefined : "repeatShow"}
          disabled={locked}
          title={lockedHint}
          value={current}
          onChange={(e) => onShow(e.target.value as RepeatShow)}
          className="w-full text-foreground"
        >
          {options.map((o) => (
            <option key={o} value={o}>
              {REPEAT_SHOW_LABEL[o]}
            </option>
          ))}
        </Select>
      </label>
      {current === "days_before" && (
        <label className="flex items-center gap-2 text-sm">
          <InputText
            type="number"
            name={locked ? undefined : "repeatLeadDays"}
            disabled={locked}
            title={lockedHint}
            min={0}
            max={90}
            value={lead}
            placeholder={String(defaultLead(repeat))}
            onChange={(e) => onLead(e.target.value)}
            className="w-20 text-center"
            aria-label="Days before it is due"
          />
          <span className="text-muted">days before it is due</span>
        </label>
      )}
    </div>
  );
}
