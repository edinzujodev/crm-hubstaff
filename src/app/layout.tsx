import { NavSkeleton, ProfileSkeleton } from "@/components/page-skeleton";
import { Button } from "@/components/ui";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { asc } from "drizzle-orm";
import { db, schema } from "@/db";
import { signOut } from "@/app/actions";
import { NavLink } from "@/components/nav-link";
import { Topbar } from "@/components/topbar";
import { TopbarStatus } from "@/components/topbar-status";
import { SidebarToggle, ThemeToggle } from "@/components/sidebar-toggle";
import { UserSwitcher } from "@/components/user-switcher";
import { Toaster } from "@/components/toaster";
import { PrimeProvider } from "@/components/prime-provider";
import { ProfileMenu } from "@/components/profile-menu";
import { SyncButton } from "@/components/sync-button";
import { IdleSignOut } from "@/components/idle-sign-out";
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
    <>
    <IdleSignOut />
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
          <UserSwitcher users={users.map((u) => ({ id: u.id, name: u.name }))} currentId={auth.user.id} />
        </section>
      )}

      <form action={signOut} className="border-t border-border pt-3">
        <Button className="w-full justify-center" severity="secondary" outlined>Sign out</Button>
      </form>
    </ProfileMenu>
    </>
  );
}

async function NavLinks() {
  const auth = await getAuth();
  if (!auth) return null;
  const role = auth.role;
  const links: [string, string, string, boolean][] = [
    ["/dashboard", "Dashboard", "pi-home", true],
    ["/tasks", "Tasks", "pi-check-square", true],
    ["/leads", "Leads", "pi-bullseye", role === "super_admin"],
    ["/clients", "Clients", "pi-briefcase", role === "super_admin" || role === "leader"],
    ["/reports", "Reports", "pi-chart-bar", role === "super_admin" || role === "leader"],
    ["/hr", "HR", "pi-users", true],
    ["/config", "Config", "pi-cog", role === "super_admin" || role === "leader"],
  ];
  return (
    <nav aria-label="Main" className="flex flex-wrap gap-1.5 md:flex-col">
      {links
        .filter(([, , , show]) => show)
        .map(([href, label, icon]) => (
          <NavLink key={href} href={href} icon={icon}>
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
    <html lang="en" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <head>
        {/* PrimeReact theme: noir (black on light, white on dark). The script below picks light or dark from the saved choice, or the system setting. */}
        {/* eslint-disable-next-line @next/next/no-css-tags */}
        <link id="theme-light" suppressHydrationWarning rel="stylesheet" href="/themes/lara-light-noir/theme.css?v=5" />
        {/* eslint-disable-next-line @next/next/no-css-tags */}
        <link id="theme-dark" suppressHydrationWarning rel="stylesheet" href="/themes/lara-dark-noir/theme.css?v=5" media="not all" />
        <script
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: `try{var d=document.documentElement,t=localStorage.getItem("theme");if(t!=="light"&&t!=="dark"&&t!=="blue")t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";d.dataset.theme=t;var dk=t!=="light";d.style.colorScheme=dk?"dark":"light";document.getElementById("theme-light").media=dk?"not all":"all";document.getElementById("theme-dark").media=dk?"all":"not all";if(localStorage.getItem("sidebar")==="collapsed")d.dataset.sidebar="collapsed"}catch(e){}`,
          }}
        />
      </head>
      {/* Browser extensions (Grammarly) add attributes to <body> before React loads. Without this the mismatch counts
          as a runtime error, and in dev every rebuild then hard-reloads the page. */}
      <body className="min-h-full font-sans" suppressHydrationWarning>
        <PrimeProvider>
        <div className="flex min-h-screen flex-col md:flex-row">
          <aside className="sidebar relative z-40 flex flex-col gap-5 border-b border-border bg-surface px-3 py-3 text-foreground md:sticky md:top-0 md:h-screen md:w-60 md:shrink-0 md:border-b-0 md:border-r md:pb-5 md:pt-0">
            <div className="sb-head -mx-3 flex items-center justify-between gap-2 border-b border-border px-6 py-4">
              <Link href="/" className="sb-label py-1 text-base font-semibold">
                Client tracker
              </Link>
              <span className="flex items-center gap-1">
                <ThemeToggle />
                <SidebarToggle />
              </span>
            </div>
            <Suspense fallback={<NavSkeleton />}>
              <NavLinks />
            </Suspense>
            <div className="flex flex-col items-start gap-3 md:mt-auto">
              <span
                className={`sb-label badge ${mode === "mock" ? "border-amber-400 text-amber-400" : "border-emerald-500 text-emerald-400"}`}
                title={mode === "mock" ? "Hours are generated from CRM sessions. Set HUBSTAFF_* in .env for live data." : "Using the Hubstaff API"}
              >
                Hubstaff: {mode}
              </span>
              <Suspense fallback={<ProfileSkeleton />}>
                <Account />
              </Suspense>
            </div>
          </aside>
          <Toaster />
          <div className="flex min-w-0 flex-1 flex-col">
            <Suspense>
              <Topbar>
                <Suspense>
                  <TopbarStatus />
                </Suspense>
              </Topbar>
            </Suspense>
            <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
          </div>
        </div>
        </PrimeProvider>
      </body>
    </html>
  );
}
