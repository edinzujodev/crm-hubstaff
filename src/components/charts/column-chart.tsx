import { hoursTick, niceScale, shortDay } from "@/lib/chart";

export type ColumnDatum = { key: string; label: string; value: number; tip: string };

const W = 960;
const H = 232;
const M = { top: 20, right: 8, bottom: 26, left: 40 };

/**
 * One series of columns on a zero baseline (value in hours). Thin columns with
 * a 4px rounded top, hairline grid, the tallest column labelled, and a
 * tooltip on every column through the surrounding ChartTip.
 */
export function ColumnChart({ data, ariaLabel }: { data: ColumnDatum[]; ariaLabel: string }) {
  const max = Math.max(0, ...data.map((d) => d.value));
  if (max === 0) return <p className="py-8 text-center text-sm text-muted">No tracked time in this range.</p>;

  const { step, top } = niceScale(max);
  const plotW = W - M.left - M.right;
  const plotH = H - M.top - M.bottom;
  const base = M.top + plotH;
  const slot = plotW / data.length;
  const bw = Math.min(24, Math.max(2, slot - 2));
  const y = (v: number) => base - (v / top) * plotH;
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const every = Math.ceil(data.length / 8);
  const maxIndex = data.findIndex((d) => d.value === max);
  const focusable = data.length <= 31;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel} className="block h-auto w-full">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={M.left} x2={W - M.right} y1={y(t)} y2={y(t)} stroke={t === 0 ? "var(--viz-axis)" : "var(--viz-grid)"} strokeWidth={1} />
          <text x={M.left - 6} y={y(t) + 4} textAnchor="end" fontSize={11} fill="var(--viz-muted)">
            {hoursTick(t, top)}
          </text>
        </g>
      ))}

      {data.map((d, i) => {
        const x = M.left + i * slot + (slot - bw) / 2;
        const h = (d.value / top) * plotH;
        const r = Math.min(4, h, bw / 2);
        return (
          <g key={d.key} className="group outline-none" data-tip={d.tip} tabIndex={focusable ? 0 : undefined}>
            <rect x={M.left + i * slot} y={M.top} width={slot} height={plotH} fill="transparent" />
            {h > 0 && (
              <path
                d={`M${x},${base} V${y(d.value) + r} Q${x},${y(d.value)} ${x + r},${y(d.value)} H${x + bw - r} Q${x + bw},${y(d.value)} ${x + bw},${y(d.value) + r} V${base} Z`}
                fill="var(--series-1)"
                className="group-hover:opacity-75 group-focus:opacity-75"
              />
            )}
            {i % every === 0 && (
              <text x={M.left + i * slot + slot / 2} y={H - 8} textAnchor="middle" fontSize={11} fill="var(--viz-muted)">
                {shortDay(d.key)}
              </text>
            )}
          </g>
        );
      })}

      <text
        x={M.left + maxIndex * slot + slot / 2}
        y={y(max) - 6}
        textAnchor="middle"
        fontSize={11}
        fontWeight={600}
        fill="var(--foreground)"
        pointerEvents="none"
      >
        {data[maxIndex].label}
      </text>
    </svg>
  );
}
