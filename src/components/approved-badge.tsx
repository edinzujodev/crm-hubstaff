// The outline of a wavy badge: a circle whose edge swells and dips eight times.
const WAVY = (() => {
  const points: string[] = [];
  for (let i = 0; i < 96; i++) {
    const a = (i / 96) * Math.PI * 2;
    const r = 12 + 1.6 * Math.cos(8 * a);
    points.push(`${(14 + r * Math.cos(a)).toFixed(2)},${(14 + r * Math.sin(a)).toFixed(2)}`);
  }
  return points.join(" ");
})();

type Shape = "wavy" | "circle" | "square" | "octagon";

/** One review state: a coloured shape with a white icon in the middle. */
function Badge({ icon, color, title, shape }: { icon: string; color: string; title: string; shape: Shape }) {
  return (
    <span className="relative inline-flex h-7 w-7 items-center justify-center" title={title} role="img" aria-label={title}>
      <svg aria-hidden viewBox="0 0 28 28" className={`absolute inset-0 h-full w-full ${color}`}>
        {shape === "wavy" && <polygon points={WAVY} fill="currentColor" />}
        {shape === "circle" && <circle cx="14" cy="14" r="13" fill="currentColor" />}
        {shape === "octagon" && <polygon points="9,1.5 19,1.5 26.5,9 26.5,19 19,26.5 9,26.5 1.5,19 1.5,9" fill="currentColor" />}
        {shape === "square" && <rect x="2" y="2" width="24" height="24" rx="7" fill="currentColor" />}
      </svg>
      <i aria-hidden className={`pi ${icon} relative text-xs font-bold text-white`} />
    </span>
  );
}

/** A finished task that the team leader approved. */
export function ApprovedBadge({ at }: { at?: string }) {
  return <Badge shape="square" icon="pi-check" color="text-emerald-600" title={at ? `Approved ${at}` : "Approved"} />;
}

/** Sent back by the team leader, with the reason on hover. */
export function ReturnedBadge({ reason }: { reason?: string | null }) {
  return <Badge shape="square" icon="pi-undo" color="text-orange-500" title={reason ? `Returned: ${reason}` : "Returned"} />;
}

/** Finished by the assignee and waiting for the team leader. */
export function OnReviewBadge() {
  return <Badge shape="square" icon="pi-clock" color="text-violet-500" title="On review" />;
}

/** Stuck: it can't go on until something is sorted out. The reason is on hover. */
export function BlockedBadge({ reason }: { reason?: string | null }) {
  return <Badge shape="square" icon="pi-ban" color="text-red-600" title={reason ? `Blocked: ${reason}` : "Blocked"} />;
}
