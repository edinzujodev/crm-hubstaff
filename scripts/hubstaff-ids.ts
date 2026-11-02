// Prints the Hubstaff ids needed in .env and on the Team page:
//   npm run hubstaff:ids
import "dotenv/config";
import { hubstaffGet } from "@/lib/hubstaff/live";

type Org = { id: number; name: string };
type Project = { id: number; name: string; status: string };
type Member = { user_id: number };
type User = { id: number; name: string; email: string };

async function main() {
  const { organizations } = await hubstaffGet<{ organizations: Org[] }>("/organizations");
  for (const org of organizations) {
    console.log(`\nOrganization ${org.id}: ${org.name}   -> HUBSTAFF_ORG_ID`);
    const { projects } = await hubstaffGet<{ projects: Project[] }>(`/organizations/${org.id}/projects?page_limit=500`);
    for (const p of projects) console.log(`  project ${p.id}: ${p.name} (${p.status})   -> HUBSTAFF_PROJECT_ID`);
    const { members, users } = await hubstaffGet<{ members: Member[]; users?: User[] }>(
      `/organizations/${org.id}/members?include=users&page_limit=500`,
    );
    const byId = new Map((users ?? []).map((u) => [u.id, u]));
    for (const m of members) {
      const u = byId.get(m.user_id);
      console.log(`  user ${m.user_id}: ${u ? `${u.name} <${u.email}>` : ""}   -> Team page`);
    }
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
