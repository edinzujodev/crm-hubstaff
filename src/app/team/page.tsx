import Link from "next/link";
import { Suspense } from "react";
import { asc } from "drizzle-orm";
import { connection } from "next/server";
import { db, schema } from "@/db";
import { setHubstaffUserId } from "@/app/actions";
import { AddMemberForm } from "@/components/add-member-form";

async function Members() {
  await connection();
  const users = await db.select().from(schema.users).orderBy(asc(schema.users.name));
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-border text-left text-xs text-muted">
          <tr>
            <th className="px-3 py-2 font-medium">Name</th>
            <th className="px-3 py-2 font-medium">Email</th>
            <th className="px-3 py-2 font-medium">Hubstaff user id</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className="border-b border-border last:border-0">
              <td className="px-3 py-2">
                <Link href={`/reports?user=${u.id}`} className="hover:underline">
                  {u.name}
                </Link>
              </td>
              <td className="px-3 py-2 text-muted">{u.email}</td>
              <td className="px-3 py-2">
                <form action={setHubstaffUserId.bind(null, u.id)} className="flex gap-2">
                  <input
                    name="hubstaffUserId"
                    defaultValue={u.hubstaffUserId ?? ""}
                    inputMode="numeric"
                    aria-label={`Hubstaff user id for ${u.name}`}
                    className="input w-32 font-mono"
                  />
                  <button className="btn">Save</button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function TeamPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Team</h1>
      <p className="max-w-2xl text-sm text-muted">
        Hubstaff time is matched to people by their Hubstaff user id. Without it, Start can&apos;t assign the Hubstaff
        task to them and their hours show as unmatched.
      </p>
      <AddMemberForm />
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <Members />
      </Suspense>
    </div>
  );
}
