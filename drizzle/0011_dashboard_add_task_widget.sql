-- The "Add task" widget joined the default layout for super admins and team leaders.
-- Dashboards created before that don't have it, so put it on top of theirs (once).
INSERT INTO "dashboard_widgets" ("user_id", "type", "config", "position", "size")
SELECT
  u."id",
  'new-task',
  '{}'::jsonb,
  COALESCE((SELECT MIN(w."position") FROM "dashboard_widgets" w WHERE w."user_id" = u."id"), 1) - 1,
  'full'
FROM "users" u
WHERE u."dashboard_seeded_at" IS NOT NULL
  AND (u."role" = 'super_admin' OR EXISTS (SELECT 1 FROM "teams" t WHERE t."leader_id" = u."id"))
  AND NOT EXISTS (SELECT 1 FROM "dashboard_widgets" w WHERE w."user_id" = u."id" AND w."type" = 'new-task');
