import { db, schema } from "./src/db";
async function main() {
  const u = await db
    .select({ id: schema.users.id, email: schema.users.email, onb: schema.users.onboardedAt, totp: schema.users.totpEnabledAt, job: schema.users.jobTitle })
    .from(schema.users);
  console.log(u);
  process.exit(0);
}
main();
