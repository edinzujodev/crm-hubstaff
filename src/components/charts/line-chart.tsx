import { shortDay } from "@/lib/chart";

/** `value` is a percentage (0-100); null means nothing was tracked that day, which breaks the line. */
export type LineDatum = { key: string; value: number | null; tip: string };

const W = 960;
const H = 200;
const M = { top: 12, right: 12, bottom: 26, left: 40 };

/** One series on a fixed 0-100% axis: 2px line, 10% wash, end dot with a surface ring, crosshair on hover. */
export function LineChart({ data, ariaLabel }: { data: LineDatum[]; ariaLabel: string }) {
  if (!data.some((d) => d.value !== null)) {
    return <p className="py-8 text-center text-sm text-muted">No tracked time in this range.</p>;
  }
  const plotW = W - M.left - M.right;
  const plotH = H - M.top - M.bottom;
  const base = M.top + plotH;
  const slot = plotW / data.length;
  const x = (i: number) => M.left + i * slot + slot / 2;
  const y = (v: number) => base - (v / 100) * plotH;
  const every = Math.ceil(data.length / 8);

  // Runs of consecutive days that have a value.
  const runs: { i: number; v: number }[][] = [];
  data.forEach((d, i) => {
    if (d.value === null) return;
    const last = runs.at(-1);
    if (last && last.at(-1)!.i === i - 1) last.push({ i, v: d.value });
    else runs.push([{ i, v: d.value }]);
  });
  const lastPoint = runs.at(-1)!.at(-1)!;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel} className="block h-auto w-full">
      {[0, 25, 50, 75, 100].map((t) => (
        <g key={t}>
          <line x1={M.left} x2={W - M.right} y1={y(t)} y2={y(t)} stroke={t === 0 ? "var(--viz-axis)" : "var(--viz-grid)"} strokeWidth={1} />
          <text x={M.left - 6} y={y(t) + 4} textAnchor="end" fontSize={11} fill="var(--viz-muted)">
            {t}%
          </text>
        </g>
      ))}

      {runs.map((run) => {
        const pts = run.map((p) => `${x(p.i)},${y(p.v)}`);
        return (
          <g key={run[0].i}>
            {run.length > 1 && (
              <polygon points={`${x(run[0].i)},${base} ${pts.join(" ")} ${x(run.at(-1)!.i)},${base}`} fill="var(--series-1)" opacity={0.1} />
            )}
            <polyline points={pts.join(" ")} fill="none" stroke="var(--series-1)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          </g>
        );
      })}

      <circle cx={x(lastPoint.i)} cy={y(lastPoint.v)} r={4} fill="var(--series-1)" stroke="var(--surface)" strokeWidth={2} />
      <text x={x(lastPoint.i)} y={y(lastPoint.v) - 10} textAnchor="middle" fontSize={11} fontWeight={600} fill="var(--foreground)">
        {lastPoint.v}%
      </text>

      {data.map((d, i) => (
        <g key={d.key} className="group outline-none" data-tip={d.tip} tabIndex={data.length <= 31 ? 0 : undefined}>
          <rect x={M.left + i * slot} y={M.top} width={slot} height={plotH} fill="transparent" />
          <line x1={x(i)} x2={x(i)} y1={M.top} y2={base} stroke="var(--viz-axis)" strokeWidth={1} className="opacity-0 group-hover:opacity-100 group-focus:opacity-100" />
          {d.value !== null && (
            <circle cx={x(i)} cy={y(d.value)} r={4} fill="var(--series-1)" stroke="var(--surface)" strokeWidth={2} className="opacity-0 group-hover:opacity-100 group-focus:opacity-100" />
          )}
          {i % every === 0 && (
            <text x={x(i)} y={H - 8} textAnchor="middle" fontSize={11} fill="var(--viz-muted)">
              {shortDay(d.key)}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}
