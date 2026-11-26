-- The HR tabs were renamed: Approvals is Requests, Vacations is Time off. Point existing notifications at the new pages.
UPDATE "notifications" SET "href" = '/hr/requests' WHERE "href" = '/hr/approvals';--> statement-breakpoint
UPDATE "notifications" SET "href" = '/hr/time-off' WHERE "href" = '/hr/vacations';
