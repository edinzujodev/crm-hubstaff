import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { asc } from "drizzle-orm";
import { db, schema } from "@/db";
import { signOut, switchUser } from "@/app/actions";
import { NavLink } from "@/components/nav-link";
import { Topbar } from "@/components/topbar";
import { TopbarStatus } from "@/components/topbar-status";
import { Toaster } from "@/components/toaster";
import { ProfileMenu } from "@/components/profile-menu";
import { SyncButton } from "@/components/sync-button";
import { hubstaffMode, config } from "@/lib/config";
import { getAuth } from "@/lib/auth";
import { authMode } from "@/lib/session";
import { fmtDateTime } from "@/lib/format";
import { lastSyncAt } from "@/lib/sync";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Client tracker",
  description: "Tasks with hours pulled automatically from Hubstaff",
};

async function Account() {
  const auth = await getAuth();
  if (!auth) return null;
  const quickSwitch = authMode() === "mock";
  const users = quickSwitch ? await db.select().from(schema.users).orderBy(asc(schema.users.name)) : [];
  const roleLabel = { super_admin: "Super admin", leader: "Team leader", worker: "Member" }[auth.role];
  return (
    <ProfileMenu name={auth.user.name} email={auth.user.email} role={roleLabel}>
      <section className="space-y-2 border-t border-border pt-3">
        <h2 className="text-xs font-medium text-muted">Hubstaff</h2>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Suspense>
            <SyncStatus />
          </Suspense>
          <SyncButton />
        </div>
      </section>

      {quickSwitch && (
        <section className="space-y-2 border-t border-border pt-3">
          <h2 className="text-xs font-medium text-muted">Development: switch person</h2>
          <form action={switchUser} className="flex items-center gap-2">
            <select name="userId" defaultValue={auth.user.id} aria-label="Switch to" className="input min-w-0 flex-1 py-1">
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
            <button className="btn py-1">Go</button>
          </form>
        </section>
      )}

      <form action={signOut} className="border-t border-border pt-3">
        <button className="btn w-full justify-center">Sign out</button>
      </form>
    </ProfileMenu>
  );
}

async function NavLinks() {
  const auth = await getAuth();
  if (!auth) return null;
  const role = auth.role;
  const links: [string, string, boolean][] = [
    ["/dashboard", "Dashboard", true],
    ["/tasks", "Tasks", true],
    ["/critical", "Critical", role === "super_admin" || role === "leader"],
    ["/recurring", "Recurring", role === "super_admin" || role === "leader"],
    ["/leads", "Leads", role === "super_admin"],
    ["/clients", "Clients", role === "super_admin" || role === "leader"],
    ["/reports", "Reports", role === "super_admin" || role === "leader"],
    ["/team", "Team", role === "super_admin" || role === "leader"],
  ];
  return (
    <nav aria-label="Main" className="flex flex-wrap gap-1 md:flex-col">
      {links
        .filter(([, , show]) => show)
        .map(([href, label]) => (
          <NavLink key={href} href={href}>
            {label}
          </NavLink>
        ))}
    </nav>
  );
}

async function SyncStatus() {
  await connection();
  const last = await lastSyncAt();
  return (
    <span className="text-xs text-muted">
      {last ? `Last sync ${fmtDateTime(last, config.timeZone)}` : "Not synced yet"}
    </span>
  );
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  const mode = hubstaffMode();
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">
        <div className="flex min-h-screen flex-col md:flex-row">
          <aside className="flex flex-col gap-4 border-b border-border bg-surface px-3 py-3 md:sticky md:top-0 md:h-screen md:w-56 md:shrink-0 md:border-b-0 md:border-r md:py-5">
            <Link href="/" className="px-3 font-semibold">
              Client tracker
            </Link>
            <Suspense>
              <NavLinks />
            </Suspense>
            <div className="flex flex-col items-start gap-3 md:mt-auto">
              <span
                className={`badge ${mode === "mock" ? "border-amber-400 text-amber-700 dark:text-amber-400" : "border-emerald-500 text-emerald-700 dark:text-emerald-400"}`}
                title={mode === "mock" ? "Hours are generated from CRM sessions. Set HUBSTAFF_* in .env for live data." : "Using the Hubstaff API"}
              >
                Hubstaff: {mode}
              </span>
              <Suspense>
                <Account />
              </Suspense>
            </div>
          </aside>
          <Toaster />
          <div className="flex min-w-0 flex-1 flex-col">
            <Topbar>
              <Suspense>
                <TopbarStatus />
              </Suspense>
            </Topbar>
            <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
