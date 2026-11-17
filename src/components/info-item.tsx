/** One fact about the task: a round icon, a small label and the value under it. */
export function InfoItem({
  icon,
  label,
  children,
}: {
  icon: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 bg-surface px-4 py-3">
      <span
        aria-hidden
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
      >
        <i className={`pi ${icon} text-sm`} />
      </span>
      <div className="min-w-0">
        <p className="text-xs text-muted">{label}</p>
        <p className="truncate text-sm font-medium">{children}</p>
      </div>
    </div>
  );
}
