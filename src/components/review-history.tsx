import { fmtDateTime } from "@/lib/format";

export type ReviewEntry = {
  id: number;
  result: "approved" | "rejected";
  note: string | null;
  reviewerName: string | null;
  at: Date;
};

/** Every review a task went through, newest first: who checked it, when, and why when it was not OK. */
export function ReviewHistory({ reviews, tz }: { reviews: ReviewEntry[]; tz: string }) {
  if (reviews.length === 0) return null;
  return (
    <ul className="space-y-2">
      {reviews.map((r) => (
        <li key={r.id} className="rounded-md border border-border p-2 text-sm">
          <p>
            <span
              className={`font-medium ${r.result === "approved" ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}
            >
              {r.result === "approved" ? "Approved" : "Returned"}
            </span>
            <span className="text-muted">
              {" "}
              · by {r.reviewerName ?? "someone"} · {fmtDateTime(r.at, tz)}
            </span>
          </p>
          {r.note && <p className="mt-1 whitespace-pre-wrap">{r.note}</p>}
        </li>
      ))}
    </ul>
  );
}
