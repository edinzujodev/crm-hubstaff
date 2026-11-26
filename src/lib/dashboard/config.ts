import { z } from "zod";
import type { Role } from "@/lib/auth";

/**
 * Everything about dashboard widgets that is safe to ship to the browser: the types, their settings
 * (validated with zod, on save and again on every read), the add-widget presets and the starter layouts.
 * Anything that touches the database lives in scope.ts / queries.ts.
 */

export const SIZES = ["s", "m", "l", "full"] as const;
export type Size = (typeof SIZES)[number];
export const SIZE_LABEL: Record<Size, string> = { s: "Small", m: "Medium", l: "Large", full: "Full width" };
/** Static class names (Tailwind needs to see them whole). A 12-column grid; everything stacks on phones. */
export const SIZE_CLASS: Record<Size, string> = {
  s: "md:col-span-6 lg:col-span-4",
  m: "md:col-span-6",
  l: "md:col-span-12 lg:col-span-8",
  full: "md:col-span-12",
};

/** Column layouts of the dashboard. Widgets sit in a column and stack top to bottom; phones show one column. */
export const LAYOUTS = {
  "1": { label: "1 column", count: 1, class: "md:grid-cols-1" },
  "2": { label: "2 columns", count: 2, class: "md:grid-cols-2" },
  "2-1": { label: "2 columns, wide left", count: 2, class: "md:grid-cols-[2fr_1fr]" },
  "1-2": { label: "2 columns, wide right", count: 2, class: "md:grid-cols-[1fr_2fr]" },
  "3": { label: "3 columns", count: 3, class: "md:grid-cols-3" },
} as const;
export type Layout = keyof typeof LAYOUTS;
export const LAYOUT_KEYS = Object.keys(LAYOUTS) as Layout[];
export const isLayout = (v: unknown): v is Layout => typeof v === "string" && v in LAYOUTS;
export const MAX_SECTIONS = 12;

/** The saved layouts of a dashboard's rows. Older values were a single layout key, such as "2". */
export function parseLayouts(value: string | null | undefined): Layout[] {
  if (!value) return ["2"];
  if (isLayout(value)) return [value];
  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed)) {
      const layouts = parsed.filter(isLayout).slice(0, MAX_SECTIONS);
      if (layouts.length) return layouts;
    }
  } catch {
    // fall through to the default
  }
  return ["2"];
}

export const RANGE_KEYS = ["today", "this_week", "last_7", "this_month", "last_month", "last_30"] as const;
export type RangeKey = (typeof RANGE_KEYS)[number];
export const RANGE_LABEL: Record<RangeKey, string> = {
  today: "Today",
  this_week: "This week",
  last_7: "Last 7 days",
  this_month: "This month",
  last_month: "Last month",
  last_30: "Last 30 days",
};

export const WIDGET_TYPES = [
  "new-task",
  "tasks",
  "task-counts",
  "stats",
  "time-chart",
  "time-breakdown",
  "clients",
  "team-workload",
  "working-now",
  "leads",
  "hr-my-leave",
  "hr-calendar",
  "hr-away",
  "hr-approvals",
] as const;
export type WidgetType = (typeof WIDGET_TYPES)[number];

const id = z.number().int().positive();
const range = z.enum(RANGE_KEYS).default("this_week");
/** Whose data a widget shows. What is allowed depends on the viewer's role (see scope.ts). */
const who = {
  who: z.enum(["me", "team", "person", "everyone"]).default("me"),
  userId: id.nullable().default(null),
  teamId: id.nullable().default(null),
};

/** HR widgets: a calendar or a list, and a short (a week) or long (a month) stretch of time. */
export const HR_VIEWS = ["calendar", "list"] as const;
export const HR_LENGTHS = ["short", "long"] as const;
const hrView = (d: (typeof HR_VIEWS)[number]) => z.enum(HR_VIEWS).default(d);
const hrLength = z.enum(HR_LENGTHS).default("short");
const hrScope = z.enum(["everyone", "team"]).default("everyone");

export const schemas = {
  "new-task": z.object({}),
  tasks: z.object({
    ...who,
    show: z.enum(["open", "in_progress", "done"]).default("open"),
    due: z.enum(["any", "overdue", "critical", "attention"]).default("any"),
    clientId: id.nullable().default(null),
    sort: z.enum(["due", "newest"]).default("due"),
    limit: z.number().int().min(1).max(50).default(10),
  }),
  "task-counts": z.object({ ...who }),
  stats: z.object({ ...who, clientId: id.nullable().default(null), range }),
  "time-chart": z.object({
    ...who,
    clientId: id.nullable().default(null),
    range: range.default("last_7"),
    metric: z.enum(["hours", "activity"]).default("hours"),
  }),
  "time-breakdown": z.object({
    ...who,
    range,
    by: z.enum(["client", "person", "team", "task"]).default("client"),
  }),
  clients: z.object({
    range: range.default("this_month"),
    sort: z.enum(["tracked", "late", "open", "name"]).default("tracked"),
    limit: z.number().int().min(1).max(50).default(10),
  }),
  "team-workload": z.object({ teamId: id.nullable().default(null), range }),
  "working-now": z.object({ teamId: id.nullable().default(null) }),
  leads: z.object({}),
  "hr-my-leave": z.object({ view: hrView("list"), length: hrLength }),
  "hr-calendar": z.object({ view: hrView("calendar"), length: hrLength, scope: hrScope }),
  "hr-away": z.object({ view: hrView("list"), length: hrLength, scope: hrScope }),
  "hr-approvals": z.object({ length: hrLength }),
} satisfies Record<WidgetType, z.ZodType>;

export type ConfigOf<T extends WidgetType> = z.infer<(typeof schemas)[T]>;
export type AnyConfig = Record<string, unknown>;

/** Strict: throws a ZodError. Used when saving. */
export function validateConfig(type: WidgetType, raw: unknown): AnyConfig {
  return schemas[type].parse(raw ?? {}) as AnyConfig;
}

/** Forgiving: stored settings that no longer fit (a removed option, hand-edited data) fall back to the defaults. */
export function parseConfig<T extends WidgetType>(type: T, raw: unknown): ConfigOf<T> {
  const schema = schemas[type] as unknown as z.ZodType<ConfigOf<T>>;
  const parsed = schema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : schema.parse({});
}

export function isWidgetType(v: string): v is WidgetType {
  return (WIDGET_TYPES as readonly string[]).includes(v);
}
export function isSize(v: string): v is Size {
  return (SIZES as readonly string[]).includes(v);
}

// ---------------------------------------------------------------------------------------------
// What the settings form shows, and what the add-widget gallery offers.
// ---------------------------------------------------------------------------------------------

type Option = { value: string; label: string };
export type FieldDef =
  | { kind: "who" }
  | { kind: "client"; label: string }
  | { kind: "team"; label: string; empty: string }
  | { kind: "select"; key: string; label: string; options: Option[]; number?: boolean };

export type Preset = {
  id: string;
  label: string;
  description: string;
  config: AnyConfig;
  /** Who may pick it; defaults to everyone who may use the widget type. */
  roles?: Role[];
};

export type WidgetDef = {
  label: string;
  description: string;
  roles: Role[];
  defaultSize: Size;
  fields: FieldDef[];
  presets: Preset[];
};

const ALL: Role[] = ["super_admin", "leader", "worker"];
const LEADERS: Role[] = ["super_admin", "leader"];

const rangeField: FieldDef = {
  kind: "select",
  key: "range",
  label: "Period",
  options: RANGE_KEYS.map((value) => ({ value, label: RANGE_LABEL[value] })),
};
const limitField: FieldDef = {
  kind: "select",
  key: "limit",
  label: "Show up to",
  number: true,
  options: [5, 10, 20, 50].map((n) => ({ value: String(n), label: `${n} rows` })),
};

const viewField: FieldDef = {
  kind: "select",
  key: "view",
  label: "Show as",
  options: [
    { value: "calendar", label: "Calendar" },
    { value: "list", label: "List" },
  ],
};
const lengthField: FieldDef = {
  kind: "select",
  key: "length",
  label: "Length",
  options: [
    { value: "short", label: "Short: one week" },
    { value: "long", label: "Long: a month" },
  ],
};
const scopeField: FieldDef = {
  kind: "select",
  key: "scope",
  label: "Whose",
  options: [
    { value: "everyone", label: "The whole company" },
    { value: "team", label: "My team" },
  ],
};

export const WIDGETS: Record<WidgetType, WidgetDef> = {
  "new-task": {
    label: "Add task",
    description: "The new-task form, right on your dashboard.",
    roles: LEADERS,
    defaultSize: "full",
    fields: [],
    presets: [{ id: "new", label: "Add task", description: "Create a task without leaving the dashboard.", config: {} }],
  },
  tasks: {
    label: "Task list",
    description: "Tasks filtered by person, status, client and how late they are.",
    roles: ALL,
    defaultSize: "l",
    fields: [
      { kind: "who" },
      {
        kind: "select",
        key: "show",
        label: "Status",
        options: [
          { value: "open", label: "Open" },
          { value: "done", label: "Done" },
        ],
      },
      {
        kind: "select",
        key: "due",
        label: "Deadline",
        options: [
          { value: "any", label: "Any" },
          { value: "overdue", label: "Running late (overdue)" },
          { value: "critical", label: "Critical or overdue" },
          { value: "attention", label: "Approaching, critical or overdue" },
        ],
      },
      { kind: "client", label: "Client" },
      {
        kind: "select",
        key: "sort",
        label: "Order",
        options: [
          { value: "due", label: "Soonest deadline first" },
          { value: "newest", label: "Newest first" },
        ],
      },
      limitField,
    ],
    presets: [
      { id: "mine", label: "My open tasks", description: "What is on your plate.", config: { who: "me" } },
      {
        id: "mine-late",
        label: "My running late tasks",
        description: "Your overdue tasks.",
        config: { who: "me", due: "overdue" },
      },
      {
        id: "team-late",
        label: "Team's running late tasks",
        description: "Overdue tasks across the team (all teams for a super admin).",
        config: { who: "team", due: "overdue" },
        roles: LEADERS,
      },
      {
        id: "team-attention",
        label: "Critical & approaching",
        description: "Tasks about to be late, using the team's urgency levels.",
        config: { who: "team", due: "attention" },
        roles: LEADERS,
      },
      {
        id: "team-open",
        label: "Team's open tasks",
        description: "Everything open in the team.",
        config: { who: "team" },
        roles: LEADERS,
      },
      {
        id: "person",
        label: "Someone's tasks",
        description: "Pick a person and follow their open tasks.",
        config: { who: "person" },
        roles: LEADERS,
      },
    ],
  },
  "task-counts": {
    label: "Task counts",
    description: "Open, running late, critical and unassigned tasks at a glance.",
    roles: ALL,
    defaultSize: "s",
    fields: [{ kind: "who" }],
    presets: [
      { id: "mine", label: "My task counts", description: "Counts for your own tasks.", config: { who: "me" } },
      {
        id: "team",
        label: "Team task counts",
        description: "Counts for the whole team.",
        config: { who: "team" },
        roles: LEADERS,
      },
    ],
  },
  stats: {
    label: "Hours summary",
    description: "Tracked and billable time, activity level and days worked.",
    roles: ALL,
    defaultSize: "m",
    fields: [{ kind: "who" }, { kind: "client", label: "Client" }, rangeField],
    presets: [
      { id: "mine", label: "My hours", description: "Your tracked time this week.", config: { who: "me" } },
      {
        id: "team",
        label: "Team hours",
        description: "Tracked time for the team.",
        config: { who: "team" },
        roles: LEADERS,
      },
    ],
  },
  "time-chart": {
    label: "Hours chart",
    description: "Hours (or activity %) per day as a chart.",
    roles: ALL,
    defaultSize: "m",
    fields: [
      { kind: "who" },
      { kind: "client", label: "Client" },
      rangeField,
      {
        kind: "select",
        key: "metric",
        label: "Show",
        options: [
          { value: "hours", label: "Hours per day" },
          { value: "activity", label: "Activity % per day" },
        ],
      },
    ],
    presets: [
      { id: "mine", label: "My hours per day", description: "Your last 7 days.", config: { who: "me" } },
      {
        id: "team",
        label: "Team hours per day",
        description: "The team's last 7 days.",
        config: { who: "team" },
        roles: LEADERS,
      },
      {
        id: "activity",
        label: "Activity per day",
        description: "Share of tracked time with keyboard or mouse activity.",
        config: { who: "me", metric: "activity" },
      },
    ],
  },
  "time-breakdown": {
    label: "Time breakdown",
    description: "Where the hours went: by client, person, team or task.",
    roles: LEADERS,
    defaultSize: "m",
    fields: [
      { kind: "who" },
      rangeField,
      {
        kind: "select",
        key: "by",
        label: "Split by",
        options: [
          { value: "client", label: "Client" },
          { value: "person", label: "Person" },
          { value: "team", label: "Team" },
          { value: "task", label: "Task" },
        ],
      },
    ],
    presets: [
      {
        id: "client",
        label: "Time by client",
        description: "Share of tracked time per client.",
        config: { who: "team", by: "client" },
      },
      {
        id: "person",
        label: "Time by person",
        description: "Share of tracked time per person.",
        config: { who: "team", by: "person" },
      },
      {
        id: "team",
        label: "Time by team",
        description: "Share of tracked time per team.",
        config: { who: "everyone", by: "team" },
        roles: ["super_admin"],
      },
    ],
  },
  clients: {
    label: "Clients",
    description: "Clients with open and late tasks and tracked time.",
    roles: LEADERS,
    defaultSize: "l",
    fields: [
      rangeField,
      {
        kind: "select",
        key: "sort",
        label: "Order",
        options: [
          { value: "tracked", label: "Most time tracked" },
          { value: "late", label: "Most late tasks" },
          { value: "open", label: "Most open tasks" },
          { value: "name", label: "Name" },
        ],
      },
      limitField,
    ],
    presets: [
      { id: "clients", label: "Clients", description: "Workload and time per client.", config: {} },
      {
        id: "late",
        label: "Clients with late tasks",
        description: "Clients with the most overdue work first.",
        config: { sort: "late" },
      },
    ],
  },
  "team-workload": {
    label: "Team workload",
    description: "Per person: open and late tasks and tracked time.",
    roles: LEADERS,
    defaultSize: "l",
    fields: [{ kind: "team", label: "Team", empty: "All teams" }, rangeField],
    presets: [{ id: "workload", label: "Team workload", description: "Who has what on their plate.", config: {} }],
  },
  "working-now": {
    label: "Working now",
    description: "Who has a task running at the moment.",
    roles: LEADERS,
    defaultSize: "s",
    fields: [{ kind: "team", label: "Team", empty: "All teams" }],
    presets: [{ id: "now", label: "Working now", description: "Live list of running tasks.", config: {} }],
  },
  leads: {
    label: "Leads pipeline",
    description: "Leads per stage and the expected monthly value of the open pipeline.",
    roles: ["super_admin"],
    defaultSize: "m",
    fields: [],
    presets: [{ id: "leads", label: "Leads pipeline", description: "Where the pipeline stands.", config: {} }],
  },
  "hr-my-leave": {
    label: "My vacation days",
    description: "Vacation days left, and your time off as a list or on a calendar.",
    roles: ALL,
    defaultSize: "m",
    fields: [viewField, lengthField],
    presets: [
      {
        id: "short",
        label: "Vacation days left",
        description: "Days left this year and your next time off.",
        config: { view: "list", length: "short" },
      },
      {
        id: "long-list",
        label: "My time off",
        description: "Your balance in full, with everything coming up and waiting for approval.",
        config: { view: "list", length: "long" },
      },
      {
        id: "calendar",
        label: "My time off calendar",
        description: "This month with your days off, holidays and blocked days marked.",
        config: { view: "calendar", length: "long" },
      },
    ],
  },
  "hr-calendar": {
    label: "Company calendar",
    description: "Events, holidays, blocked days, birthdays and work anniversaries.",
    roles: ALL,
    defaultSize: "l",
    fields: [viewField, lengthField, scopeField],
    presets: [
      {
        id: "week",
        label: "This week",
        description: "The company calendar for the current week.",
        config: { view: "calendar", length: "short" },
      },
      {
        id: "month",
        label: "This month",
        description: "The whole month, like the HR calendar.",
        config: { view: "calendar", length: "long" },
      },
      {
        id: "upcoming",
        label: "Coming up",
        description: "A list of what is on in the next 7 days.",
        config: { view: "list", length: "short" },
      },
      {
        id: "upcoming-long",
        label: "Coming up this month",
        description: "A list of what is on in the next 30 days.",
        config: { view: "list", length: "long" },
      },
    ],
  },
  "hr-away": {
    label: "Who's away",
    description: "The vacation calendar: who is off, as a list or a planner.",
    roles: ALL,
    defaultSize: "m",
    fields: [viewField, lengthField, scopeField],
    presets: [
      {
        id: "week-list",
        label: "Away this week",
        description: "Who is off today and in the next 7 days.",
        config: { view: "list", length: "short" },
      },
      {
        id: "week",
        label: "Time off: this week",
        description: "People and days of the current week.",
        config: { view: "calendar", length: "short" },
      },
      {
        id: "month",
        label: "Time off: this month",
        description: "People and days of the whole month.",
        config: { view: "calendar", length: "long" },
      },
      {
        id: "team",
        label: "My team's time off",
        description: "Who in your team is off in the next 30 days.",
        config: { view: "list", length: "long", scope: "team" },
      },
    ],
  },
  "hr-approvals": {
    label: "Requests to approve",
    description: "Time-off requests waiting for your decision.",
    roles: LEADERS,
    defaultSize: "m",
    fields: [{ ...lengthField, options: [{ value: "short", label: "Short: the oldest few" }, { value: "long", label: "Long: all of them" }] }],
    presets: [
      { id: "short", label: "Requests to approve", description: "How many are waiting, and the oldest ones.", config: { length: "short" } },
      { id: "long", label: "All requests to approve", description: "Every request waiting for you.", config: { length: "long" } },
    ],
  },
};

export function widgetsFor(role: Role): WidgetType[] {
  return WIDGET_TYPES.filter((t) => WIDGETS[t].roles.includes(role));
}

export function presetsFor(type: WidgetType, role: Role): Preset[] {
  return WIDGETS[type].presets.filter((p) => (p.roles ?? WIDGETS[type].roles).includes(role));
}

// ---------------------------------------------------------------------------------------------
// Starter layouts, used the first time someone opens their dashboard (and by "Reset").
// ---------------------------------------------------------------------------------------------

export type Starter = { type: WidgetType; size: Size; config: AnyConfig };

export function starterLayout(role: Role): Starter[] {
  if (role === "worker") {
    return [
      { type: "tasks", size: "l", config: { who: "me" } },
      { type: "task-counts", size: "s", config: { who: "me" } },
      { type: "stats", size: "m", config: { who: "me", range: "this_week" } },
      { type: "time-chart", size: "m", config: { who: "me", range: "last_7" } },
    ];
  }
  const who = role === "super_admin" ? "everyone" : "team";
  return [
    { type: "new-task", size: "full", config: {} },
    { type: "task-counts", size: "s", config: { who } },
    { type: "tasks", size: "l", config: { who, due: "overdue" } },
    { type: "stats", size: "full", config: { who, range: role === "super_admin" ? "this_month" : "this_week" } },
    { type: "team-workload", size: "l", config: {} },
    { type: "working-now", size: "s", config: {} },
    { type: "time-breakdown", size: "m", config: { who, by: "client", range: "this_week" } },
    ...(role === "super_admin"
      ? ([
          { type: "leads", size: "m", config: {} },
          { type: "clients", size: "full", config: {} },
        ] as Starter[])
      : ([{ type: "time-chart", size: "m", config: { who, range: "last_7" } }] as Starter[])),
  ];
}
