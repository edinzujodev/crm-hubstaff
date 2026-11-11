"use client";

import { REPEAT_SHOW_LABEL, REPEAT_SHOW_OPTIONS, type RepeatShow, defaultLead } from "@/lib/repeat-show";

/** "When should each new copy show up in my list?" for a weekly or monthly task. */
export function RepeatShowFields({
  repeat,
  show,
  lead,
  onShow,
  onLead,
}: {
  repeat: "weekly" | "monthly";
  show: RepeatShow;
  lead: string;
  onShow: (v: RepeatShow) => void;
  onLead: (v: string) => void;
}) {
  const options = REPEAT_SHOW_OPTIONS[repeat];
  // A choice that doesn't exist for this repeat (monthly start after switching to weekly) falls back.
  const current = options.includes(show) ? show : "days_before";
  return (
    <div className="space-y-2">
      <label className="flex flex-col gap-1 text-xs text-muted">
        Show each new one in my list
        <select
          name="repeatShow"
          value={current}
          onChange={(e) => onShow(e.target.value as RepeatShow)}
          className="input text-foreground"
        >
          {options.map((o) => (
            <option key={o} value={o}>
              {REPEAT_SHOW_LABEL[o]}
            </option>
          ))}
        </select>
      </label>
      {current === "days_before" && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="number"
            name="repeatLeadDays"
            min={0}
            max={90}
            value={lead}
            placeholder={String(defaultLead(repeat))}
            onChange={(e) => onLead(e.target.value)}
            className="input w-20 text-center"
            aria-label="Days before it is due"
          />
          <span className="text-muted">days before it is due</span>
        </label>
      )}
    </div>
  );
}
