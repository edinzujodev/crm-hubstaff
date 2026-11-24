import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
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
  // The column layout of each row of the person's dashboard: a JSON list such as ["3","1"] (see src/lib/dashboard/config.ts).
  dashboardLayout: text("dashboard_layout").notNull().default("2"),
  // Set once the person's dashboard has been given its starter widgets, so removing them all stays removed.
  dashboardSeededAt: timestamp("dashboard_seeded_at", { withTimezone: true }),
  // Profile details the person fills in themselves on /profile. All optional.
  jobTitle: text("job_title"),
  phone: text("phone"),
  birthDate: date("birth_date"),
  address: text("address"),
  bio: text("bio"),
  // The day the person started working at the company (optional, set during onboarding or on /profile).
  startedOn: date("started_on"),
  // Set when the person finished the first-sign-in setup (/welcome). Until then every page sends them there.
  onboardedAt: timestamp("onboarded_at", { withTimezone: true }),
  // Two-step verification with an authenticator app (TOTP, RFC 6238). The secret is base32; it is only in use once
  // totp_enabled_at is set. totp_last_step is the last accepted 30-second step, so a code can't be used twice.
  totpSecret: text("totp_secret"),
  totpEnabledAt: timestamp("totp_enabled_at", { withTimezone: true }),
  totpLastStep: integer("totp_last_step"),
  // Vacation days the person gets each year, unless leave_allowances sets that year differently.
  annualLeaveDays: numeric("annual_leave_days", { precision: 4, scale: 1, mode: "number" }).notNull().default(20),
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
    // Which column of the dashboard the widget is in (0 is the left one); `position` orders it within the column.
    // Which row (section) of the dashboard the widget is in, then which column of that row.
    sectionIndex: integer("section_index").notNull().default(0),
    columnIndex: integer("column_index").notNull().default(0),
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
    // Signed in with Google but the authenticator code is still missing: the session lets the person reach
    // /login/verify and nothing else. mfa_failures counts wrong codes; too many ends the session.
    mfaPending: boolean("mfa_pending").notNull().default(false),
    mfaFailures: integer("mfa_failures").notNull().default(0),
  },
  (t) => [index("auth_sessions_user_idx").on(t.userId)],
);

export const teams = pgTable("teams", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  // The team leader; also a member of the team.
  leaderId: integer("leader_id").references((): AnyPgColumn => users.id),
  // The team whose leader reviews this team leader's own tasks.
  parentTeamId: integer("parent_team_id").references((): AnyPgColumn => teams.id),
  // Urgency levels, set by the team leader: a task due in fewer hours than this is "approaching" / "critical".
  approachingHours: integer("approaching_hours").notNull().default(72),
  criticalHours: integer("critical_hours").notNull().default(24),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// A client is one company, or a group that has several companies listed under it.
export const clientKind = pgEnum("client_kind", ["company", "group"]);

export const clients = pgTable("clients", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  kind: clientKind("kind").notNull().default("company"),
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

// The companies of a group client. Tasks and reports stay at the client; these are the companies it covers.
export const clientCompanies = pgTable(
  "client_companies",
  {
    id: serial("id").primaryKey(),
    clientId: integer("client_id")
      .notNull()
      .references(() => clients.id),
    name: text("name").notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("client_companies_client_name_idx").on(t.clientId, t.name)],
);

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

// "review": finished by the assignee, waiting for the team leader to approve or deny it.
export const taskStatus = pgEnum("task_status", ["todo", "in_progress", "done", "review"]);
export const reviewResult = pgEnum("review_result", ["approved", "rejected"]);

// A reusable "how to do this" for tasks: instructions plus a checklist. Attaching it copies both into the task.
export const checklistTemplates = pgTable("checklist_templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const checklistTemplateItems = pgTable(
  "checklist_template_items",
  {
    id: serial("id").primaryKey(),
    templateId: integer("template_id")
      .notNull()
      .references(() => checklistTemplates.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    text: text("text").notNull(),
  },
  (t) => [index("checklist_template_items_template_idx").on(t.templateId)],
);
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
    // Blocked: the task cannot move on right now. blockedReason is optional. Cleared when it is unblocked.
    blockedAt: timestamp("blocked_at", { withTimezone: true }),
    blockedReason: text("blocked_reason"),
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
    // The template whose instructions and checklist were copied into this task (kept for reference only).
    templateId: integer("template_id").references((): AnyPgColumn => checklistTemplates.id, { onDelete: "set null" }),
    // Review: when the assignee finishes, the team leader (reviewer) approves or denies with a reason.
    reviewerId: integer("reviewer_id").references((): AnyPgColumn => users.id),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    reviewResult: reviewResult("review_result"),
    reviewNote: text("review_note"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
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

// The checklist of one task. Items can be ticked, but the task can be finished without ticking them all;
// finishing leaves them as they are.
export const taskChecklistItems = pgTable(
  "task_checklist_items",
  {
    id: serial("id").primaryKey(),
    taskId: integer("task_id")
      .notNull()
      .references(() => tasks.id),
    position: integer("position").notNull().default(0),
    text: text("text").notNull(),
    doneAt: timestamp("done_at", { withTimezone: true }),
  },
  (t) => [index("task_checklist_items_task_idx").on(t.taskId)],
);

// Every review a task went through, so earlier "Checked: not OK" answers are not lost when it is reviewed again.
export const taskReviews = pgTable(
  "task_reviews",
  {
    id: serial("id").primaryKey(),
    taskId: integer("task_id")
      .notNull()
      .references(() => tasks.id),
    reviewerId: integer("reviewer_id").references(() => users.id),
    result: reviewResult("result").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("task_reviews_task_idx").on(t.taskId)],
);

// Every time a task was blocked: when, by whom, why (optional) and when it was unblocked (null while still blocked).
export const taskBlocks = pgTable(
  "task_blocks",
  {
    id: serial("id").primaryKey(),
    taskId: integer("task_id")
      .notNull()
      .references(() => tasks.id),
    reason: text("reason"),
    blockedAt: timestamp("blocked_at", { withTimezone: true }).notNull().defaultNow(),
    blockedById: integer("blocked_by_id").references(() => users.id),
    unblockedAt: timestamp("unblocked_at", { withTimezone: true }),
    unblockedById: integer("unblocked_by_id").references(() => users.id),
  },
  (t) => [index("task_blocks_task_idx").on(t.taskId)],
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
    // True once a person moved this slot to another task in the CRM; the sync then leaves taskId alone.
    taskMoved: boolean("task_moved").notNull().default(false),
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

// ---- HR -------------------------------------------------------------------------------------------------------

// vacation counts against the yearly allowance; the others don't. sick is recorded without approval. religious is
// a religious holiday the person celebrates (they differ per person in BiH, so they aren't a day off for everyone).
export const timeOffKind = pgEnum("time_off_kind", ["vacation", "sick", "personal", "unpaid", "religious"]);
export const timeOffStatus = pgEnum("time_off_status", ["pending", "approved", "rejected", "cancelled"]);

// Time off and sick days. The number of days isn't stored: it is counted from the dates (working days only, public
// holidays skipped), so a holiday added later is taken into account.
export const timeOff = pgTable(
  "time_off",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references((): AnyPgColumn => users.id, { onDelete: "cascade" }),
    kind: timeOffKind("kind").notNull(),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    // Only for a single day: half of it.
    halfDay: boolean("half_day").notNull().default(false),
    note: text("note"),
    status: timeOffStatus("status").notNull().default("pending"),
    // Who entered it (the person, or their leader / a super admin on their behalf).
    createdById: integer("created_by_id").references((): AnyPgColumn => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    decidedById: integer("decided_by_id").references((): AnyPgColumn => users.id, { onDelete: "set null" }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decisionNote: text("decision_note"),
  },
  (t) => [
    index("time_off_user_idx").on(t.userId),
    index("time_off_dates_idx").on(t.startDate, t.endDate),
    check("time_off_dates_order", sql`${t.endDate} >= ${t.startDate}`),
  ],
);

// A person's vacation allowance for one year, when it differs from the default: users.annual_leave_days for the
// year, plus what is left from the year before. A row here overrides either number for that year.
export const leaveAllowances = pgTable(
  "leave_allowances",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references((): AnyPgColumn => users.id, { onDelete: "cascade" }),
    year: integer("year").notNull(),
    // null: users.annual_leave_days.
    days: numeric("days", { precision: 4, scale: 1, mode: "number" }),
    // null: worked out from the year before.
    carriedOver: numeric("carried_over", { precision: 4, scale: 1, mode: "number" }),
    // Carried-over days not used by this day are lost (BiH: 30 June). null: 30 June.
    carryOverUntil: date("carry_over_until"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("leave_allowances_user_year").on(t.userId, t.year)],
);

// Holidays on top of the built-in list (src/lib/holidays.ts). "custom" adds one; "hidden" takes a built-in one
// off for that date.
export const holidaySource = pgEnum("holiday_source", ["custom", "hidden"]);

export const holidays = pgTable(
  "holidays",
  {
    id: serial("id").primaryKey(),
    date: date("date").notNull(),
    name: text("name").notNull(),
    // A day off for everyone (skipped when counting leave), or only shown on the calendar.
    dayOff: boolean("day_off").notNull().default(true),
    source: holidaySource("source").notNull().default("custom"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("holidays_date_idx").on(t.date)],
);

// Company or team events on the HR calendar. team_id null: the whole company.
export const events = pgTable(
  "events",
  {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    description: text("description"),
    location: text("location"),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    // "HH:MM" in the app's time zone; null for an all-day event.
    startTime: text("start_time"),
    endTime: text("end_time"),
    teamId: integer("team_id").references((): AnyPgColumn => teams.id, { onDelete: "cascade" }),
    createdById: integer("created_by_id").references((): AnyPgColumn => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("events_dates_idx").on(t.startDate, t.endDate),
    check("events_dates_order", sql`${t.endDate} >= ${t.startDate}`),
  ],
);

export type User = typeof users.$inferSelect;
export type Team = typeof teams.$inferSelect;
export type Client = typeof clients.$inferSelect;
export type ClientCompany = typeof clientCompanies.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type Lead = typeof leads.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type WorkSession = typeof workSessions.$inferSelect;
export type DashboardWidget = typeof dashboardWidgets.$inferSelect;
export type HubstaffActivity =typeof hubstaffActivities.$inferSelect;
export type TimeOff = typeof timeOff.$inferSelect;
export type LeaveAllowance = typeof leaveAllowances.$inferSelect;
export type Holiday = typeof holidays.$inferSelect;
export type HrEvent = typeof events.$inferSelect;
