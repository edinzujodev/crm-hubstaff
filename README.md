# Bookkeeping CRM (MVP)

The daily task tool for a bookkeeping firm moving off ClickUp. This MVP does one thing:
**the hours tracked in Hubstaff land on the CRM task automatically, with no manual re-entry.**

Pick a task → **Start** → work → **Finish** → the task page shows the tracked time from Hubstaff (total,
activity %, per person, per day, per session).

## How Hubstaff fits in

What the Hubstaff API can and can't do decides the design:

| Question | Answer |
| --- | --- |
| Can the REST API (v2) start/stop the desktop timer? | **No.** Time is only tracked by the Hubstaff desktop app, against a Hubstaff project/task. |
| Can anything start the timer remotely? | The desktop app ships a local CLI (`HubstaffCLI start_task <id>`, `stop`, `status`, a beta feature). It only works **on the same computer**, and the user has to click "Always allow" once. |
| Can the API create tasks? | Yes: `POST /v2/projects/{project_id}/tasks`. |
| Can the API return time per task? | Yes: `GET /v2/organizations/{org_id}/activities` returns 10-minute slots with `task_id`, `user_id`, `tracked` and `overall` (active) seconds. These can show up **up to ~20 min late**, and one request covers at most 7 days. |
| Webhooks? | `timer.start` / `timer.stop` exist, but they need a public HTTPS URL. Not used in the MVP. |

So the flow is:

1. **Start** in the CRM creates the matching Hubstaff task on first use (`"<Client>: <title> [CRM #id]"`, assigned to
   the person), opens a CRM *work session*, and asks the **local helper** to run `HubstaffCLI start_task <id>`.
   If the helper isn't running, the CRM says which Hubstaff task to start by hand.
2. Hubstaff tracks as usual (screenshots, activity, idle detection).
3. **Finish** stops the timer via the helper, closes the session and syncs right away. The app also syncs every
   5 minutes while open, and `GET /api/sync` can be called by a scheduler.
4. **Hours come from Hubstaff activities only**, matched to the CRM task by Hubstaff `task_id`. CRM sessions are only
   used to explain the time and flag problems.

### Start/stop many times, forgetting Finish, overlaps

| Situation | What happens |
| --- | --- |
| Start/Finish several times on one task | Every session is kept; the task total is the sum of all Hubstaff activity on it. |
| Tracked in the Hubstaff app without clicking Start in the CRM | Still counts toward the task (it's the same Hubstaff task). The report shows it as "tracked without Start in the CRM". |
| Start another task while one is running | The previous session ends (`switched`), the same as the Hubstaff timer, which tracks one task at a time. |
| Forgot to click Finish | Hubstaff's own idle timeout stops counting when the person walks away, so hours stay correct. The CRM marks the session after `STALE_SESSION_HOURS` (4h) and auto-closes it after `AUTO_CLOSE_SESSION_HOURS` (12h), at the end of the last Hubstaff activity in it. |
| Session open much longer than Hubstaff tracked | Marked "Hubstaff tracked Xh of Yh open". |
| Session with no Hubstaff time at all | Marked "was the timer running on this task?" (only after the ~20 min Hubstaff delay has passed). |
| Overlapping sessions for one person on two tasks (e.g. two tabs) | Marked on both tasks. |
| Hubstaff time on a task the CRM doesn't know, or with no task | Shown on the task list as "did not land on a CRM task" (last 7 days), so a missing link is visible. |
| Time edited or deleted in Hubstaff later | Each sync re-reads the last 3 days (and back to the oldest open session) and replaces what it had. |

## Stack

| Layer | Technology |
| --- | --- |
| Framework | Next.js 16 (App Router, Server Actions, Turbopack) |
| UI | React 19 · Tailwind CSS 4 |
| Language | TypeScript 5 (Node 22+) |
| Database | Postgres 16 (Docker Compose, port 5433) via the `postgres` driver |
| ORM / migrations | Drizzle ORM · drizzle-kit |
| Validation | Zod 4 |
| Time tracking | Hubstaff API v2 + Hubstaff desktop CLI (through a local helper) |
| Tooling | tsx (seed, helper and scripts) · ESLint 9 |

```
src/db/schema.ts          users, clients, tasks, work_sessions, hubstaff_activities, app_state
src/lib/hubstaff/         live.ts (API v2 client), mock.ts (fixture provider), types.ts
src/lib/sync.ts           pull activities → upsert/reconcile → auto-close forgotten sessions
src/lib/sessions.ts       Start/Finish logic, creates Hubstaff tasks
src/lib/report.ts         per-task report and flags
src/app/                  pages (tasks, task detail, team), server actions, /api/sync
helper/hubstaff-helper.ts local helper that drives HubstaffCLI
scripts/                  seed, hubstaff-ids
```

## Setup

Requirements: Node 22+, Docker.

```bash
npm install
cp .env.example .env
docker compose up -d          # Postgres on localhost:5433
npm run db:migrate
npm run db:seed               # demo team, clients, tasks (+ demo time in mock mode)
npm run dev                   # http://localhost:3000
```

Without Hubstaff credentials the app runs in **mock mode** (badge in the header): Hubstaff tasks get fake ids and
"tracked time" is generated from the CRM sessions, including a simulated idle stop after 3h, so the whole flow can be
tried without an account.

### Connect a real Hubstaff account

1. Create a personal access token at <https://developer.hubstaff.com/personal_access_tokens> with
   `hubstaff:read hubstaff:write tasks:read tasks:write`. It's a *refresh token*; the app exchanges it for access
   tokens and stores the rotated one in the database, so `.env` only seeds it once.
2. In `.env`: set `HUBSTAFF_MODE=live` and `HUBSTAFF_REFRESH_TOKEN`, then run `npm run hubstaff:ids` to list
   organizations, projects and users. Fill in `HUBSTAFF_ORG_ID` and `HUBSTAFF_PROJECT_ID` (the project CRM tasks are
   created in; a client can override it via `clients.hubstaff_project_id`).
3. On the **Team** page, set each person's Hubstaff user id.
4. Add your people and tasks in the app. (`npm run db:seed -- --yes` in live mode wipes the database and adds demo
   people without Hubstaff ids and no demo time.)

If the token ever stops working, create a new one, put it in `.env`, and delete the `hubstaff_refresh_token` row
from `app_state`.

### Local helper (one-click Start in Hubstaff)

On each person's computer, with the Hubstaff desktop app installed:

```bash
npm run helper
```

It listens on `127.0.0.1:47811`, accepts requests only from the CRM's origin (`HELPER_ALLOWED_ORIGINS`), and runs
`HubstaffCLI start_task <id>` / `stop`. The first call shows a Hubstaff permission prompt: choose **Always allow**.
Set `HUBSTAFF_CLI_PATH` if the CLI isn't in the default install folder. `HELPER_MOCK=1` only logs the calls.

The helper is optional. Without it, Start/Finish still record sessions and people start the task in the Hubstaff app.

### Scheduled sync

`GET /api/sync` with `Authorization: Bearer $CRON_SECRET` pulls Hubstaff even when nobody has the app open
(Windows Task Scheduler, cron, or Vercel Cron when deployed).

## Not in the MVP yet

- **Authentication.** "You are" in the header is a cookie switch. Add real sign-in before using it outside a trusted
  network.
- Hubstaff webhooks (`timer.start`/`timer.stop`) for live "who is working on what".
- The rest of the plan: client master (entities, groups, people, service scope, QuickBooks Online link), task
  catalog with a recurrence engine (weekly/monthly/quarterly, created Monday, due Friday), review workflow
  (submit/return/approve), blockers, per-client projects/deals, and the prospect → client pipeline.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js |
| `npm run db:generate` / `db:migrate` | Drizzle migrations (`drizzle/`) |
| `npm run db:seed` | Wipe the database and load demo data (asks for `-- --yes` in live mode) |
| `npm run helper` | Local Hubstaff timer helper |
| `npm run hubstaff:ids` | List Hubstaff org/project/user ids (live mode) |
| `npm run typecheck` / `lint` | Checks |
