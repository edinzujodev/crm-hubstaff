import { hubstaffMode } from "@/lib/config";
import { liveProvider } from "./live";
import { mockProvider } from "./mock";
import type { HubstaffProvider } from "./types";

export function hubstaff(): HubstaffProvider {
  return hubstaffMode() === "live" ? liveProvider : mockProvider;
}

export type { HubstaffActivityDto, HubstaffProvider } from "./types";
