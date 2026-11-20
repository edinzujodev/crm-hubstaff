"use client";

import { Select } from "@/components/ui";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SERIES_STATES, type SeriesState } from "@/lib/series-state";

const LABEL: Record<SeriesState, string> = {
  active: "Current",
  stopped: "Stopped",
  all: "All",
};

/** Recurring tasks that still repeat, ones that were stopped, or both. "Current" is the default. */
export function SeriesStateFilter({ state }: { state: SeriesState }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function choose(next: SeriesState) {
    const q = new URLSearchParams(params.toString());
    if (next === "active") q.delete("state");
    else q.set("state", next);
    router.replace(q.size ? `${pathname}?${q}` : pathname);
  }

  return (
    <Select
      aria-label="Recurring tasks to show"
      value={state}
      onChange={(e) => choose(e.target.value as SeriesState)}
      className="w-auto text-sm font-medium"
    >
      {SERIES_STATES.map((key) => (
        <option key={key} value={key}>
          {LABEL[key]}
        </option>
      ))}
    </Select>
  );
}
