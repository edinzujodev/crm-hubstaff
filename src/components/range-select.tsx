"use client";

import { Select } from "@/components/ui";
import { useRouter } from "next/navigation";

type Option = { label: string; href: string; selected: boolean };

/** Quick date ranges as a dropdown; picking one reloads the report for that range. */
export function RangeSelect({ options }: { options: Option[] }) {
  const router = useRouter();
  const current = options.find((o) => o.selected);
  return (
    <label className="flex flex-col gap-1 text-xs text-muted">
      <Select
        aria-label="Date range"
        className="w-40 text-foreground"
        value={current?.href ?? ""}
        onChange={(e) => e.target.value && router.push(e.target.value)}
      >
        {!current && <option value="">Custom range</option>}
        {options.map((o) => (
          <option key={o.label} value={o.href}>
            {o.label}
          </option>
        ))}
      </Select>
    </label>
  );
}
