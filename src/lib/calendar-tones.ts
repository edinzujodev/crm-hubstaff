import type { CalendarItem } from "@/components/hr-calendar";

/** Colours, icons and the order of things on the HR calendar; shared by the /hr page and the dashboard widgets. */
export const TYPE_TONE: Record<CalendarItem["type"], string> = {
  holiday: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300",
  religious: "bg-amber-500/10 text-amber-800 dark:text-amber-300",
  blocked: "bg-red-500/15 text-red-800 dark:text-red-300",
  birthday: "bg-pink-500/15 text-pink-800 dark:text-pink-300",
  anniversary: "bg-indigo-500/15 text-indigo-800 dark:text-indigo-300",
  event: "bg-primary text-(--primary-fg)",
  "time-off": "bg-sky-500/15 text-sky-800 dark:text-sky-300",
};
export const TYPE_ICON: Record<CalendarItem["type"], string> = {
  holiday: "pi-star",
  religious: "pi-star",
  blocked: "pi-ban",
  birthday: "pi-gift",
  anniversary: "pi-trophy",
  event: "pi-calendar",
  "time-off": "pi-sun",
};
export const ORDER: CalendarItem["type"][] = ["holiday", "blocked", "event", "religious", "birthday", "anniversary", "time-off"];
