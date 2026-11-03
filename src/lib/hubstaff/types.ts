// Shape of an activity as returned by GET /v2/organizations/{id}/activities.
// Only the fields the CRM uses are typed; the full object is stored in `raw`.
export type HubstaffActivityDto = {
  id: number;
  starts_at: string;
  user_id: number;
  project_id: number;
  task_id: number | null;
  tracked: number; // seconds tracked in the 10-minute slot
  overall: number; // seconds with input activity
  billable?: boolean;
  [key: string]: unknown;
};

export type CreateTaskInput = {
  crmTaskId: number;
  projectId: number;
  summary: string;
  assigneeHubstaffUserId: number | null;
};

export interface HubstaffProvider {
  readonly mode: "mock" | "live";
  createTask(input: CreateTaskInput): Promise<{ id: number; projectId: number }>;
  assignTask(hubstaffTaskId: number, hubstaffUserId: number): Promise<void>;
  /** Changes the task's title in Hubstaff and returns the title it had before. */
  renameTask(hubstaffTaskId: number, rename: (current: string) => string): Promise<void>;
  /** Activities whose slot starts in [start, stop). */
  listActivities(start: Date, stop: Date): Promise<HubstaffActivityDto[]>;
}
