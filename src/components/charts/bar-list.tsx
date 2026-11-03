import Link from "next/link";

export type BarDatum = { key: string; label: string; href?: string; value: number; display: string; share: string; tip: string };

/** Ranked horizontal bars on one baseline, one hue. The value sits at the tip; the tooltip has the rest. */
export function BarList({ data }: { data: BarDatum[] }) {
  const max = Math.max(0, ...data.map((d) => d.value));
  if (max === 0) return <p className="py-6 text-center text-sm text-muted">No tracked time in this range.</p>;
  return (
    <ul className="space-y-3">
      {data.map((d) => (
        <li key={d.key} data-tip={d.tip} tabIndex={0} className="group outline-none">
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            {d.href ? (
              <Link href={d.href} className="truncate hover:underline">
                {d.label}
              </Link>
            ) : (
              <span className="truncate">{d.label}</span>
            )}
            <span className="shrink-0">
              <span className="font-mono tabular-nums">{d.display}</span>
              <span className="ml-2 text-xs text-muted">{d.share}</span>
            </span>
          </div>
          <div className="h-2.5">
            <div
              className="h-full rounded-r-[4px] group-hover:opacity-75 group-focus:opacity-75"
              style={{ width: `${Math.max(1, (d.value / max) * 100)}%`, background: "var(--series-1)" }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
