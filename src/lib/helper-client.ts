// Browser-side calls to the local helper (helper/hubstaff-helper.ts), which
// drives the Hubstaff desktop timer through HubstaffCLI on this computer.

const HELPER_URL = process.env.NEXT_PUBLIC_HUBSTAFF_HELPER_URL || "http://127.0.0.1:47811";

export type HelperResult = { ok: true; detail?: string } | { ok: false; reason: "not_running" | "error"; detail?: string };

async function call(path: string, body?: object): Promise<HelperResult> {
  try {
    const res = await fetch(`${HELPER_URL}${path}`, {
      method: body ? "POST" : "GET",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(4000),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string; output?: string };
    return res.ok ? { ok: true, detail: json.output } : { ok: false, reason: "error", detail: json.error };
  } catch {
    return { ok: false, reason: "not_running" };
  }
}

export const helper = {
  start: (hubstaffTaskId: number) => call("/start", { hubstaffTaskId }),
  stop: () => call("/stop", {}),
};
