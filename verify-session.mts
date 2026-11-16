import "dotenv/config";
import postgres from "postgres";
import { createHash } from "node:crypto";
const sql = postgres(process.env.DATABASE_URL!);
const id = createHash("sha256").update("tmp-verify-token-prime").digest("hex");
await sql`delete from auth_sessions where id = ${id}`;
if (process.argv[2] === "on") await sql`insert into auth_sessions (id, user_id, expires_at) values (${id}, 2, now() + interval '3 hour')`;
await sql.end();
