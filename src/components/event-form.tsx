"use client";

import { useActionState, useEffect, useState } from "react";
import { InputSwitch } from "primereact/inputswitch";
import { Button, Checkbox, InputText, InputTextarea, Select } from "@/components/ui";
import { DateInput } from "@/components/date-input";
import { useConfirm } from "@/components/confirm-modal";
import { deleteEvent, saveEvent } from "@/app/hr/actions";
import { notify } from "@/lib/toast";
import { describeRepeat, REPEAT_LABEL, WEEKDAY_CHIPS, type Repeat } from "@/lib/recurrence";
import { weekday } from "@/lib/days";

export type EventData = {
  id: number;
  title: string;
  description: string | null;
  location: string | null;
  startDate: string;
  endDate: string;
  startTime: string | null;
  endTime: string | null;
  teamId: number | null;
  repeat: Repeat;
  repeatDays: number[] | null;
  repeatUntil: string | null;
};

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

/** The repeat settings: how often, on which days, and until when. */
function RepeatFields({
  startDate,
  initial,
}: {
  startDate: string;
  initial?: Pick<EventData, "repeat" | "repeatDays" | "repeatUntil">;
}) {
  const [on, setOn] = useState(!!initial && initial.repeat !== "none");
  const [repeat, setRepeat] = useState<Exclude<Repeat, "none">>(initial && initial.repeat !== "none" ? initial.repeat : "weekly");
  // Daily: every day unless some are picked. Weekly: the picked days, or the first day's weekday.
  const [days, setDays] = useState<number[]>(initial?.repeatDays ?? []);
  const [until, setUntil] = useState(initial?.repeatUntil ?? "");
  const shownDays = repeat === "daily" ? (days.length ? days : ALL_DAYS) : days.length ? days : startDate ? [weekday(startDate)] : [];
  const toggle = (d: number) => {
    const next = shownDays.includes(d) ? shownDays.filter((x) => x !== d) : [...shownDays, d];
    if (next.length) setDays(next.length === 7 && repeat === "daily" ? [] : next);
  };
  const summary = describeRepeat({ startDate, repeat: on ? repeat : "none", repeatDays: shownDays, repeatUntil: until || null });
  const seg = (active: boolean) =>
    `flex-1 cursor-pointer rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
      active ? "border-primary bg-primary text-(--primary-fg)" : "border-border hover:bg-foreground/5"
    }`;

  return (
    <div className="space-y-3 rounded-lg bg-foreground/[0.04] p-3">
      <label className="flex cursor-pointer items-center justify-between gap-3 text-sm font-medium">
        Repeat event
        <InputSwitch checked={on} onChange={(e) => setOn(!!e.value)} />
      </label>
      <input type="hidden" name="repeat" value={on ? repeat : "none"} />
      {on && (
        <>
          <div className="flex gap-1.5" role="radiogroup" aria-label="How often">
            {(["daily", "weekly", "monthly", "yearly"] as const).map((r) => (
              <button key={r} type="button" role="radio" aria-checked={repeat === r} className={seg(repeat === r)} onClick={() => setRepeat(r)}>
                {REPEAT_LABEL[r]}
              </button>
            ))}
          </div>
          {(repeat === "daily" || repeat === "weekly") && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted">On these days</p>
              <div className="flex flex-wrap gap-1.5">
                {WEEKDAY_CHIPS.map((c) => {
                  const active = shownDays.includes(c.day);
                  return (
                    <button
                      key={c.day}
                      type="button"
                      aria-pressed={active}
                      title={c.long}
                      onClick={() => toggle(c.day)}
                      className={`w-11 cursor-pointer rounded-md border py-1 text-xs font-medium ${
                        active ? "border-primary bg-primary text-(--primary-fg)" : "border-border text-muted hover:bg-foreground/5"
                      }`}
                    >
                      {c.short}
                    </button>
                  );
                })}
              </div>
              {repeat === "daily" && (
                <div className="flex gap-3 text-xs">
                  <button type="button" className="cursor-pointer font-medium text-muted hover:text-foreground hover:underline" onClick={() => setDays([])}>
                    Every day
                  </button>
                  <button type="button" className="cursor-pointer font-medium text-muted hover:text-foreground hover:underline" onClick={() => setDays([1, 2, 3, 4, 5])}>
                    Working days
                  </button>
                </div>
              )}
              <input type="hidden" name="repeatDays" value={repeat === "daily" && !days.length ? "" : shownDays.join(",")} />
            </div>
          )}
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            Repeat until <span className="font-normal">(optional, empty: no end)</span>
            <DateInput name="repeatUntil" value={until} min={startDate || undefined} onChange={(e) => setUntil(e.target.value)} className="w-full" />
          </label>
          {summary && (
            <p className="flex items-center gap-2 text-sm">
              <i className="pi pi-replay text-xs text-muted" aria-hidden />
              {summary}
            </p>
          )}
        </>
      )}
    </div>
  );
}

/** Where an event can go: the whole company (super admin) and the teams the person leads. */
export type EventTeamOption = { id: number | null; name: string };

export function EventForm({
  event,
  date,
  teams,
  onDone,
}: {
  event?: EventData;
  /** The day picked on the calendar, for a new event. */
  date?: string;
  teams: EventTeamOption[];
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState(saveEvent.bind(null, event?.id ?? null), null);
  const [startDate, setStart] = useState(event?.startDate ?? date ?? "");
  const [endDate, setEnd] = useState(event?.endDate ?? "");
  const [allDay, setAllDay] = useState(!event?.startTime);
  const [deleting, setDeleting] = useState(false);
  const [ask, confirmModal] = useConfirm();
  useEffect(() => {
    if (!state?.ok) return;
    notify({ message: event ? "Event saved" : "Event added" });
    onDone();
  }, [state, onDone, event]);
  const field = "flex flex-col gap-1 text-xs font-medium text-muted";

  return (
    <form action={action} className="space-y-4">
      <label className={field}>
        Title
        <InputText name="title" defaultValue={event?.title} required maxLength={160} autoFocus className="w-full text-foreground" />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={field}>
          Date
          <DateInput
            name="startDate"
            value={startDate}
            onChange={(e) => {
              const d = e.target.value;
              setStart(d);
              // A later start moves the end along with it.
              if (endDate && d && endDate < d) setEnd(d);
            }}
            required
            className="w-full"
          />
        </label>
        <label className={field}>
          Ends on <span className="sr-only">(optional)</span>
          <DateInput name="endDate" value={endDate} min={startDate || undefined} onChange={(e) => setEnd(e.target.value)} className="w-full" />
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
        All day
      </label>
      {!allDay && (
        <div className="grid grid-cols-2 gap-3">
          <label className={field}>
            Starts
            <InputText name="startTime" type="time" defaultValue={event?.startTime ?? "09:00"} required className="w-full text-foreground" />
          </label>
          <label className={field}>
            Ends <span className="sr-only">(optional)</span>
            <InputText name="endTime" type="time" defaultValue={event?.endTime ?? ""} className="w-full text-foreground" />
          </label>
        </div>
      )}
      <RepeatFields startDate={startDate} initial={event} />
      {event && event.repeat !== "none" && <p className="text-xs text-muted">Changes apply to every repeat of this event.</p>}
      <label className={field}>
        For
        <Select name="teamId" defaultValue={event ? String(event.teamId ?? "") : String(teams[0]?.id ?? "")} className="w-full">
          {teams.map((t) => (
            <option key={t.id ?? "all"} value={t.id === null ? "" : String(t.id)}>
              {t.name}
            </option>
          ))}
        </Select>
      </label>
      <label className={field}>
        Place <span className="sr-only">(optional)</span>
        <InputText name="location" defaultValue={event?.location ?? ""} maxLength={200} placeholder="Optional" className="w-full text-foreground" />
      </label>
      <label className={field}>
        Details <span className="sr-only">(optional)</span>
        <InputTextarea name="description" defaultValue={event?.description ?? ""} rows={3} maxLength={2000} autoResize placeholder="Optional" className="w-full text-foreground" />
      </label>
      {state && !state.ok && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}
      <div className="flex items-center justify-end gap-2">
        {event ? (
          <Button
            type="button"
            text
            severity="danger"
            disabled={deleting}
            label={deleting ? "Deleting…" : "Delete"}
            onClick={async () => {
              const sure = await ask({
                title: `Delete “${event.title}”?`,
                message: event.repeat !== "none" ? "Every repeat of it comes off the calendar too." : "It comes off the calendar.",
                confirmLabel: "Delete",
              });
              if (!sure) return;
              setDeleting(true);
              const r = await deleteEvent(event.id);
              setDeleting(false);
              notify(r.ok ? { message: "Event deleted" } : { message: "Couldn't delete it", detail: r.error, tone: "error" });
              if (r.ok) onDone();
            }}
          />
        ) : null}
        <Button disabled={pending || !startDate} label={pending ? "Saving…" : "Save"} />
      </div>
      {confirmModal}
    </form>
  );
}
