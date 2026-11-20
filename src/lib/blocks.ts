/**
 * How long a task has been blocked in all: every block counted from when it was blocked to when it was unblocked.
 * A block still going counts up to when the task was finished, or up to now.
 */
export function blockedMs(
  blocks: { blockedAt: Date; unblockedAt: Date | null }[],
  finishedAt: Date | null = null,
): number {
  const now = Date.now();
  return blocks.reduce((sum, b) => {
    const end = b.unblockedAt ?? finishedAt ?? new Date(now);
    return sum + Math.max(0, end.getTime() - b.blockedAt.getTime());
  }, 0);
}
