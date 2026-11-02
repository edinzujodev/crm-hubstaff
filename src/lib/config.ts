function num(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

function optionalInt(name: string): number | null {
  const v = Number(process.env[name]);
  return Number.isInteger(v) && v > 0 ? v : null;
}

export function hubstaffMode(): "mock" | "live" {
  const mode = process.env.HUBSTAFF_MODE;
  if (mode === "mock" || mode === "live") return mode;
  return process.env.HUBSTAFF_REFRESH_TOKEN ? "live" : "mock";
}

export const config = {
  get hubstaffOrgId() {
    return optionalInt("HUBSTAFF_ORG_ID");
  },
  get hubstaffProjectId() {
    return optionalInt("HUBSTAFF_PROJECT_ID");
  },
  get staleSessionHours() {
    return num("STALE_SESSION_HOURS", 4);
  },
  get autoCloseSessionHours() {
    return num("AUTO_CLOSE_SESSION_HOURS", 12);
  },
  get timeZone() {
    return process.env.APP_TIME_ZONE || Intl.DateTimeFormat().resolvedOptions().timeZone;
  },
};
