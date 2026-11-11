import {
  type AnyPgColumn,
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// A team leader is whoever a team names as its leader (teams.leader_id), so only super admin is stored.
export const userRole = pgEnum("user_role", ["super_admin", "member"]);

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  // The person's Hubstaff user id; activities are matched to CRM users through it.
  hubstaffUserId: integer("hubstaff_user_id").unique(),
  // A person is in at most one team, so team totals never double count.
  teamId: integer("team_id").references((): AnyPgColumn => teams.id),
  role: userRole("role").notNull().default("member"),
  // Set once the person's dashboard has been given its starter widgets, so removing them all stays removed.
  dashboardSeededAt: timestamp("dashboard_seeded_at", { withTimezone: true }),
});

// One widget on a person's dashboard. Dashboards are personal; `config` holds the widget's settings
// (see src/lib/dashboard/config.ts) and is validated again every time it is read.
export const dashboardWidgets = pgTable(
  "dashboard_widgets",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references((): AnyPgColumn => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    // A custom heading; the widget's default title is used when null.
    title: text("title"),
    config: jsonb("config").notNull().default({}),
    position: integer("position").notNull(),
    size: text("size").notNull().default("m"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("dashboard_widgets_user_idx").on(t.userId)],
);

// Sign-in sessions. The cookie holds a random token; only its SHA-256 hash is stored here.
export const authSessions = pgTable(
  "auth_sessions",
  {
    id: text("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references((): AnyPgColumn => users.id),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("auth_sessions_user_idx").on(t.userId)],
);

export const teams = pgTable("teams", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  // The team leader; also a member of the team.
  leaderId: integer("leader_id").references((): AnyPgColumn => users.id),
  // Urgency levels, set by the team leader: a task due in fewer hours than this is "approaching" / "critical".
  approachingHours: integer("approaching_hours").notNull().default(72),
  criticalHours: integer("critical_hours").notNull().default(24),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const clients = pgTable("clients", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  contactName: text("contact_name"),
  email: text("email"),
  phone: text("phone"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  // Later scope: link to the QuickBooks Online customer.
  qboCustomerId: text("qbo_customer_id"),
  // Overrides HUBSTAFF_PROJECT_ID for this client's tasks.
  hubstaffProjectId: integer("hubstaff_project_id"),
});

export const leadStatus = pgEnum("lead_status", ["new", "contacted", "meeting", "proposal", "won", "lost"]);

// A prospect. Converting a lead creates a client and marks the lead "won".
export const leads = pgTable(
  "leads",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    contactName: text("contact_name"),
    email: text("email"),
    phone: text("phone"),
    // Where the lead came from (referral, website, ...).
    source: text("source"),
    status: leadStatus("status").notNull().default("new"),
    // Estimated monthly fee in whole currency units, for the pipeline total.
    expectedMonthlyValue: integer("expected_monthly_value"),
    notes: text("notes"),
    lostReason: text("lost_reason"),
    ownerId: integer("owner_id").references(() => users.id),
    // Set when the lead is converted.
    clientId: integer("client_id").references(() => clients.id),
    convertedAt: timestamp("converted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("leads_status_idx").on(t.status)],
);

export const projectKind = pgEnum("project_kind", ["one_off", "ongoing"]);

// A client's piece of work. Every task belongs to one. "One-off" work ends; "ongoing" work (a retainer,
// monthly bookkeeping) keeps collecting tasks.
export const projects = pgTable(
  "projects",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    clientId: integer("client_id")
      .notNull()
      .references(() => clients.id),
    kind: projectKind("kind").notNull().default("one_off"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("projects_client_name_idx").on(t.clientId, t.name)],
);

export const taskStatus = pgEnum("task_status", ["todo", "in_progress", "done"]);
export const taskRepeat = pgEnum("task_repeat", ["weekly", "monthly"]);
// When a copy made by a repeat appears in the open lists (see src/lib/repeat-show.ts).
export const repeatShow = pgEnum("repeat_show", ["days_before", "week_start", "month_start", "due_day"]);

export const tasks = pgTable(
  "tasks",
  {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    description: text("description"),
    clientId: integer("client_id").references(() => clients.id),
    // The project (of that client) this task is part of.
    projectId: integer("project_id").references((): AnyPgColumn => projects.id),
    assigneeId: integer("assignee_id").references(() => users.id),
    // The team that owns the task: its leader sees it and sets its urgency levels.
    teamId: integer("team_id").references((): AnyPgColumn => teams.id),
    status: taskStatus("status").notNull().default("todo"),
    dueDate: date("due_date"),
    // Set once the task has been created in Hubstaff (on first Start).
    hubstaffTaskId: integer("hubstaff_task_id").unique(),
    hubstaffProjectId: integer("hubstaff_project_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    // Soft delete: the row, its sessions and its Hubstaff time are kept; lists hide it.
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    // Recurring: marking the task done creates the next copy, due one period after this due date.
    repeat: taskRepeat("repeat"),
    // Day of month a monthly task is anchored to, so a 31st task returns to the 31st after short months.
    repeatDay: integer("repeat_day"),
    // The task this one was created from when its predecessor was marked done. Unique: one copy per task.
    // When the task was marked done (null while open, or if it was done before this was recorded).
    doneAt: timestamp("done_at", { withTimezone: true }),
    // Days before the due date that a copy shows up in the open-task lists.
    repeatLeadDays: integer("repeat_lead_days"),
    // How the copy decides when to show: some days before due (repeatLeadDays), at the start of the week or month, or on the due day.
    repeatShow: repeatShow("repeat_show"),
    // Hidden from the open-task lists until this day (set on copies made by a repeat).
    startDate: date("start_date"),
    // Id of the first task of a repeating series. Every copy keeps it, so the series can be shown as one.
    seriesId: integer("series_id").references((): AnyPgColumn => tasks.id),
    repeatedFromId: integer("repeated_from_id")
      .references((): AnyPgColumn => tasks.id)
      .unique(),
  },
  (t) => [
    index("tasks_assignee_idx").on(t.assigneeId),
    index("tasks_series_idx").on(t.seriesId),
    index("tasks_team_idx").on(t.teamId),
    index("tasks_project_idx").on(t.projectId),
  ],
);

export const sessionEndReason = pgEnum("session_end_reason", [
  "finished", // user clicked Finish
  "switched", // user started another task
  "auto_closed", // open longer than AUTO_CLOSE_SESSION_HOURS
]);

// A Start → Finish span recorded by the CRM. Sessions are only the user's intent;
// tracked hours always come from Hubstaff activities.
export const workSessions = pgTable(
  "work_sessions",
  {
    id: serial("id").primaryKey(),
    taskId: integer("task_id")
      .notNull()
      .references(() => tasks.id),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    endReason: sessionEndReason("end_reason"),
  },
  (t) => [index("work_sessions_task_idx").on(t.taskId), index("work_sessions_user_idx").on(t.userId)],
);

// Hubstaff activities: 10-minute slots of tracked time, mirrored as-is.
export const hubstaffActivities = pgTable(
  "hubstaff_activities",
  {
    id: bigint("id", { mode: "number" }).primaryKey(), // Hubstaff activity id
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    hubstaffUserId: integer("hubstaff_user_id").notNull(),
    hubstaffProjectId: integer("hubstaff_project_id").notNull(),
    hubstaffTaskId: integer("hubstaff_task_id"),
    // CRM task resolved from hubstaffTaskId at sync time (null = not a CRM task).
    taskId: integer("task_id").references(() => tasks.id),
    trackedSeconds: integer("tracked_seconds").notNull(),
    // Seconds with keyboard/mouse activity (Hubstaff "overall").
    activeSeconds: integer("active_seconds").notNull(),
    billable: boolean("billable"),
    raw: jsonb("raw"),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("hubstaff_activities_task_idx").on(t.taskId),
    index("hubstaff_activities_starts_idx").on(t.startsAt),
  ],
);

// Small key/value store: rotated Hubstaff refresh token, last sync time, etc.
export const appState = pgTable("app_state", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type Team = typeof teams.$inferSelect;
export type Client = typeof clients.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type Lead = typeof leads.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type WorkSession = typeof workSessions.$inferSelect;
export type DashboardWidget = typeof dashboardWidgets.$inferSelect;
export type HubstaffActivity =typeof hubstaffActivities.$inferSelect;
