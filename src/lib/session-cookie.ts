// Kept free of imports so proxy.ts can use it without pulling in the database.
export const SESSION_COOKIE = "crm_session";
/** A session never lasts longer than this, however active the person is. */
export const SESSION_DAYS = 14;
/** Signed out after this long without touching the app (no clicks, typing, scrolling or page loads). */
export const IDLE_MINUTES = 60;
