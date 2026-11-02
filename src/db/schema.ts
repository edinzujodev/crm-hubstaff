import {
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
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  // The person's Hubstaff user id; activities are matched to CRM users through it.
  hubstaffUserId: integer("hubstaff_user_id").unique(),
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

export const taskStatus = pgEnum("task_status", ["todo", "in_progress", "done"]);

export const tasks = pgTable(
  "tasks",
  {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    description: text("description"),
    clientId: integer("client_id").references(() => clients.id),
    assigneeId: integer("assignee_id").references(() => users.id),
    status: taskStatus("status").notNull().default("todo"),
    dueDate: date("due_date"),
    // Set once the task has been created in Hubstaff (on first Start).
    hubstaffTaskId: integer("hubstaff_task_id").unique(),
    hubstaffProjectId: integer("hubstaff_project_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("tasks_assignee_idx").on(t.assigneeId)],
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
export type Client = typeof clients.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type WorkSession = typeof workSessions.$inferSelect;
export type HubstaffActivity = typeof hubstaffActivities.$inferSelect;
