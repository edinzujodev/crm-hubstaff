/** Put in front of a task's Hubstaff title when it is deleted in the CRM, so it is obvious in Hubstaff. */
export const SOFT_DELETED_PREFIX = "[SOFT-DELETED] ";

export const markDeleted = (title: string) => (title.startsWith(SOFT_DELETED_PREFIX) ? title : SOFT_DELETED_PREFIX + title);
export const unmarkDeleted = (title: string) =>
  title.startsWith(SOFT_DELETED_PREFIX) ? title.slice(SOFT_DELETED_PREFIX.length) : title;
