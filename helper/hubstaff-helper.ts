/**
 * Local helper that lets the CRM's Start/Finish buttons drive the Hubstaff
 * desktop timer on this computer, using Hubstaff's "scripted control" CLI
 * (HubstaffCLI start_task <id> / stop). Hubstaff's REST API cannot start the
 * desktop timer, so this has to run on each person's machine.
 *
 *   npm run helper
 *
 * The first CLI call makes Hubstaff ask for permission; choose "Always allow".
 * Without the helper the CRM still works: people start the task in the Hubstaff
 * app themselves and the hours are synced the same way.
 */
import "dotenv/config";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";

const PORT = Number(process.env.HELPER_PORT) || 47811;
const ALLOWED_ORIGINS = (process.env.HELPER_ALLOWED_ORIGINS || "http://localhost:3000,http://127.0.0.1:3000")
  .split(",")
  .map((o) => o.trim());
const MOCK = process.env.HELPER_MOCK === "1";

const CLI_CANDIDATES = [
  process.env.HUBSTAFF_CLI_PATH,
  "C:\\Program Files\\Hubstaff\\HubstaffCLI.exe",
  "C:\\Program Files\\Hubstaff\\HubstaffCLI\\HubstaffCLI.exe",
  "C:\\Program Files (x86)\\Hubstaff\\HubstaffCLI.exe",
  "/Applications/Hubstaff.app/Contents/MacOS/HubstaffCLI",
  path.join(process.env.HOME ?? "", "Hubstaff/HubstaffCLI.bin.x86_64"),
].filter((p): p is string => !!p);

const cliPath = CLI_CANDIDATES.find((p) => existsSync(p));

function runCli(args: string[]): Promise<string> {
  if (MOCK) return Promise.resolve(`[mock] HubstaffCLI ${args.join(" ")}`);
  if (!cliPath) {
    return Promise.reject(new Error("HubstaffCLI not found. Install the Hubstaff desktop app or set HUBSTAFF_CLI_PATH."));
  }
  return new Promise((resolve, reject) => {
    // execFile with an argument list: nothing goes through a shell.
    execFile(cliPath, [...args, "--autostart"], { cwd: path.dirname(cliPath), timeout: 15_000 }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr.trim() || err.message));
      else resolve(stdout.trim());
    });
  });
}

function send(res: ServerResponse, origin: string | undefined, status: number, body: object) {
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 10_000) throw new Error("body too large");
  }
  return raw ? JSON.parse(raw) : {};
}

const server = createServer(async (req, res) => {
  const origin = req.headers.origin;
  // Only the CRM's own pages may drive the timer.
  if (!origin || !ALLOWED_ORIGINS.includes(origin)) return send(res, undefined, 403, { error: "origin not allowed" });

  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Private-Network", "true");
    res.writeHead(204).end();
    return;
  }

  try {
    if (req.method === "GET" && req.url === "/status") {
      return send(res, origin, 200, { output: await runCli(["status"]) });
    }
    // Requiring JSON forces a CORS preflight, so other sites can't trigger these.
    if (req.method === "POST" && req.headers["content-type"]?.startsWith("application/json")) {
      if (req.url === "/start") {
        const id = Number((await readJson(req)).hubstaffTaskId);
        if (!Number.isInteger(id) || id <= 0) return send(res, origin, 400, { error: "hubstaffTaskId must be a positive integer" });
        return send(res, origin, 200, { output: await runCli(["start_task", String(id)]) });
      }
      if (req.url === "/stop") {
        return send(res, origin, 200, { output: await runCli(["stop"]) });
      }
    }
    send(res, origin, 404, { error: "not found" });
  } catch (e) {
    send(res, origin, 500, { error: e instanceof Error ? e.message : String(e) });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Hubstaff helper listening on http://127.0.0.1:${PORT}`);
  console.log(MOCK ? "Mock mode: CLI calls are only logged." : `HubstaffCLI: ${cliPath ?? "NOT FOUND (set HUBSTAFF_CLI_PATH)"}`);
  console.log(`Allowed origins: ${ALLOWED_ORIGINS.join(", ")}`);
});
