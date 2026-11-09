/** A round badge with a person's initials. */
export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center rounded-full bg-primary/15 font-semibold text-primary ${
        size === "sm" ? "h-7 w-7 text-xs" : "h-9 w-9 text-sm"
      }`}
    >
      {initials}
    </span>
  );
}
