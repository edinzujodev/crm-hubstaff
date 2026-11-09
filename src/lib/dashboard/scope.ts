import { cache } from "react";
import { asc } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Auth } from "@/lib/auth";
import type { AnyConfig, WidgetType } from "@/lib/dashboard/config";
import { RANGE_LABEL, WIDGETS, type RangeKey } from "@/lib/dashboard/config";

/** People, teams and clients, loaded once per request and shared by every widget. */
export const getDirectory = cache(async () => {
  const [users, teams, clients] = await Promise.all([
    db
      .select({ id: schema.users.id, name: schema.users.name, teamId: schema.users.teamId })
      .from(schema.users)
      .orderBy(asc(schema.users.name)),
    db.select().from(schema.teams).orderBy(asc(schema.teams.name)),
    db.select({ id: schema.clients.id, name: schema.clients.name }).from(schema.clients).orderBy(asc(schema.clients.name)),
  ]);
  return {
    users,
    teams,
    clients,
    userById: new Map(users.map((u) => [u.id, u])),
    teamById: new Map(teams.map((t) => [t.id, t])),
    clientById: new Map(clients.map((c) => [c.id, c])),
  };
});
export type Directory = Awaited<ReturnType<typeof getDirectory>>;

/** Whose data a widget shows once the viewer's role has been applied. Both null means everyone. */
export type Scope = { userId: number | null; teamId: number | null };

export type Resolved = {
  scope: Scope;
  /** "My", "Team Alpha's", "Everyone's" ... for building titles. */
  owner: string;
  /** A "person" widget with nobody picked yet. */
  needsSetup: boolean;
  /** The saved settings asked for more than the viewer may see, so they were narrowed. */
  clamped: boolean;
};

type WhoConfig = { who: string; userId: number | null; teamId: number | null };

const firstName = (name: string) => name.split(" ")[0];

/**
 * Applies the viewer's role to a widget's "whose data" setting.
 * Members see only themselves; a team leader sees themselves and their own team; a super admin sees anyone.
 */
export async function resolveScope(auth: Auth, cfg: WhoConfig): Promise<Resolved> {
  const dir = await getDirectory();
  const mine = (clamped: boolean): Resolved => ({
    scope: { userId: auth.user.id, teamId: null },
    owner: "My",
    needsSetup: false,
    clamped,
  });
  if (auth.role === "worker") return mine(cfg.who !== "me");
  if (cfg.who === "me") return mine(false);

  const ledId = auth.ledTeam?.id ?? null;
  const teamScope = (teamId: number | null, clamped: boolean): Resolved => ({
    scope: { userId: null, teamId },
    owner: teamId ? `${dir.teamById.get(teamId)?.name ?? "Team"}'s` : "Everyone's",
    needsSetup: false,
    clamped,
  });

  if (cfg.who === "team") {
    if (auth.role === "leader") return teamScope(ledId, cfg.teamId !== null && cfg.teamId !== ledId);
    return teamScope(cfg.teamId, false);
  }

  if (cfg.who === "person") {
    const person = cfg.userId ? dir.userById.get(cfg.userId) : undefined;
    if (!person) return { scope: { userId: auth.user.id, teamId: null }, owner: "Someone's", needsSetup: true, clamped: false };
    if (auth.role === "leader" && person.teamId !== ledId && person.id !== auth.user.id) return teamScope(ledId, true);
    return { scope: { userId: person.id, teamId: null }, owner: `${firstName(person.name)}'s`, needsSetup: false, clamped: false };
  }

  // "everyone"
  if (auth.role === "leader") return teamScope(ledId, true);
  return teamScope(null, false);
}

/** The team a team-level widget (workload, working now) covers. A leader is always limited to their own team. */
export function resolveTeam(auth: Auth, teamId: number | null): { teamId: number | null; clamped: boolean } {
  if (auth.role === "leader") return { teamId: auth.ledTeam?.id ?? null, clamped: teamId !== null && teamId !== auth.ledTeam?.id };
  return { teamId, clamped: false };
}

const hasWho = (type: WidgetType) => WIDGETS[type].fields.some((f) => f.kind === "who");

/**
 * For saving: rejects settings the viewer may not use, so the form can never store something the
 * dashboard would silently narrow later.
 */
export async function assertAllowed(auth: Auth, type: WidgetType, config: AnyConfig) {
  if (!WIDGETS[type].roles.includes(auth.role)) throw new Error("You can't add that widget.");
  if (hasWho(type)) {
    const r = await resolveScope(auth, config as unknown as WhoConfig);
    if (r.clamped) throw new Error("You can only show your own data, or your team's if you lead one.");
  }
  if ("teamId" in config && !hasWho(type)) {
    if (resolveTeam(auth, (config.teamId as number | null) ?? null).clamped) throw new Error("You can only pick your own team.");
  }
}

/** A heading for a widget that has no custom title. */
export function autoTitle(type: WidgetType, cfg: AnyConfig, owner: string, dir: Directory): string {
  const client = typeof cfg.clientId === "number" ? dir.clientById.get(cfg.clientId)?.name : undefined;
  const range = typeof cfg.range === "string" ? RANGE_LABEL[cfg.range as RangeKey]?.toLowerCase() : undefined;
  const lower = (s: string) => s.toLowerCase();
  switch (type) {
    case "tasks": {
      const status = cfg.show === "done" ? "done" : cfg.show === "in_progress" ? "in progress" : "open";
      const due = { overdue: "running late", critical: "critical", attention: "critical & approaching", any: "" }[String(cfg.due)] ?? "";
      const what = due ? `${due} tasks` : `${status} tasks`;
      return `${owner} ${what}${client ? ` · ${client}` : ""}`;
    }
    case "task-counts":
      return `${owner} task counts`;
    case "stats":
      return `${owner} hours${client ? ` · ${client}` : ""}${range ? ` · ${range}` : ""}`;
    case "time-chart":
      return `${owner} ${cfg.metric === "activity" ? "activity" : "hours"} per day${client ? ` · ${client}` : ""}${range ? ` · ${range}` : ""}`;
    case "time-breakdown": {
      const whose = owner === "Everyone's" ? "" : owner === "My" ? " · mine" : ` · ${owner.replace(/'s$/, "")}`;
      return `Time by ${lower(String(cfg.by ?? "client"))}${range ? ` · ${range}` : ""}${whose}`;
    }
    case "clients":
      return `Clients${range ? ` · ${range}` : ""}`;
    case "team-workload":
      return `Team workload${range ? ` · ${range}` : ""}`;
    default:
      return WIDGETS[type].label;
  }
}
