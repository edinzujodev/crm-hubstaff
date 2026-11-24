"use client";

import { useActionState, useEffect, useState } from "react";
import { Button, Checkbox, InputText, InputTextarea, Select } from "@/components/ui";
import { DateInput } from "@/components/date-input";
import { deleteEvent, saveEvent } from "@/app/hr/actions";
import { notify } from "@/lib/toast";

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
};

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
          <DateInput name="startDate" value={startDate} onChange={(e) => setStart(e.target.value)} required className="w-full" />
        </label>
        <label className={field}>
          Until <span className="sr-only">(optional)</span>
          <DateInput name="endDate" value={endDate} onChange={(e) => setEnd(e.target.value)} className="w-full" />
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
      <div className="flex items-center justify-between gap-2">
        {event ? (
          <Button
            type="button"
            text
            severity="danger"
            disabled={deleting}
            label={deleting ? "Deleting…" : "Delete"}
            onClick={async () => {
              if (!confirm(`Delete “${event.title}”?`)) return;
              setDeleting(true);
              const r = await deleteEvent(event.id);
              setDeleting(false);
              notify(r.ok ? { message: "Event deleted" } : { message: "Couldn't delete it", detail: r.error, tone: "error" });
              if (r.ok) onDone();
            }}
          />
        ) : (
          <span />
        )}
        <Button disabled={pending || !startDate} label={pending ? "Saving…" : event ? "Save" : "Add event"} />
      </div>
    </form>
  );
}
