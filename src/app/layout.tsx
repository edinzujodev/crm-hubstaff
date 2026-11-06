import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { asc } from "drizzle-orm";
import { db, schema } from "@/db";
import { switchUser } from "@/app/actions";
import { Toaster } from "@/components/toaster";
import { SyncButton } from "@/components/sync-button";
import { hubstaffMode, config } from "@/lib/config";
import { getCurrentUser } from "@/lib/current-user";
import { fmtDateTime } from "@/lib/format";
import { lastSyncAt } from "@/lib/sync";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Client tracker",
  description: "Tasks with hours pulled automatically from Hubstaff",
};

async function UserSwitcher() {
  const [current, users] = await Promise.all([
    getCurrentUser(),
    db.select().from(schema.users).orderBy(asc(schema.users.name)),
  ]);
  if (!users.length) return null;
  return (
    <form action={switchUser} className="flex items-center gap-1 text-sm">
      <label htmlFor="userId" className="text-muted">
        You are
      </label>
      <select id="userId" name="userId" defaultValue={current?.id} className="input py-1">
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
          </option>
        ))}
      </select>
      <button className="btn py-1">Switch</button>
    </form>
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
      <body className="flex min-h-full flex-col font-sans">
        <header className="border-b border-border bg-surface">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
            <Link href="/" className="font-semibold">
              Client tracker
            </Link>
            <nav className="flex gap-4 text-sm">
              <Link href="/">Tasks</Link>
              <Link href="/leads">Leads</Link>
              <Link href="/clients">Clients</Link>
              <Link href="/reports">Reports</Link>
              <Link href="/team">Team</Link>
            </nav>
            <span
              className={`badge ${mode === "mock" ? "border-amber-400 text-amber-700 dark:text-amber-400" : "border-emerald-500 text-emerald-700 dark:text-emerald-400"}`}
              title={mode === "mock" ? "Hours are generated from CRM sessions. Set HUBSTAFF_* in .env for live data." : "Using the Hubstaff API"}
            >
              Hubstaff: {mode}
            </span>
            <div className="ml-auto flex flex-wrap items-center gap-3">
              <Suspense>
                <SyncStatus />
              </Suspense>
              <SyncButton />
              <Suspense>
                <UserSwitcher />
              </Suspense>
            </div>
          </div>
        </header>
        <Toaster />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
