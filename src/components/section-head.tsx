/**
 * The title block at the top of a card section (`card p-5`): a heading, an optional line under it, and a line
 * across the whole card below. `children` go on the right (a button).
 */
export function SectionHead({
  title,
  sub,
  as: Heading = "h2",
  children,
}: {
  title: string;
  sub?: React.ReactNode;
  as?: "h1" | "h2";
  children?: React.ReactNode;
}) {
  return (
    <div className="-mx-5 flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 pb-4">
      <div>
        <Heading className="font-semibold">{title}</Heading>
        {sub && <p className="text-xs text-muted">{sub}</p>}
      </div>
      {children}
    </div>
  );
}
