import { Suspense } from "react";
import { connection } from "next/server";
import { HrNavLinks } from "@/components/hr-nav";
import { ProfilePhoto } from "@/components/photo-picker";
import { getAuth } from "@/lib/auth";

const ROLE_LABEL = { super_admin: "Super admin", leader: "Team lead", worker: "Staff" } as const;

/** Who you are (your photo, big: click it to change it), then the profile's pages: your details, and your time off. */
async function ProfileNav() {
  await connection();
  const auth = await getAuth();
  if (!auth) return null;
  const me = auth.user;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 md:flex-col md:items-stretch md:gap-3">
        <ProfilePhoto userId={me.id} name={me.name} hasPhoto={me.photoVersion !== null} />
        <div className="min-w-0 md:px-1">
          <p className="truncate text-xl font-semibold">{me.name}</p>
          <p className="truncate text-sm text-muted">{me.jobTitle || ROLE_LABEL[auth.role]}</p>
        </div>
      </div>
      <HrNavLinks
        label="Profile"
        root="/profile"
        groups={[
          {
            title: "",
            items: [
              { href: "/profile", label: "Personal details", icon: "pi-user" },
              { href: "/profile/time-off", label: "My time off", icon: "pi-calendar" },
            ],
          },
        ]}
      />
    </div>
  );
}

function NavSkeleton() {
  return (
    <div className="space-y-4" aria-hidden>
      <span className="block h-24 w-24 animate-pulse rounded-full bg-foreground/5 md:aspect-square md:h-auto md:w-full" />
      <div className="flex gap-2 md:flex-col">
        {[0, 1].map((i) => (
          <span key={i} className="h-9 w-32 animate-pulse rounded-md bg-foreground/5 md:w-full" />
        ))}
      </div>
    </div>
  );
}

export default function ProfileLayout({ children }: LayoutProps<"/profile">) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 md:flex-row md:items-start">
      <aside className="md:sticky md:top-16 md:w-60 md:shrink-0">
        <Suspense fallback={<NavSkeleton />}>
          <ProfileNav />
        </Suspense>
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
