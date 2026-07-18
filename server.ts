// server.ts
import { serve } from "bun";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

type Prize = { name: string; value: number };

// Track where prizes were actually loaded from (for debugging).
let PRIZES_SOURCE = "unknown";

const bakedIn = fileURLToPath(new URL("./prizes.json", import.meta.url)); // next to server.ts
const localCfg = resolve(process.cwd(), "config", "prizes.json"); // ./config/prizes.json
const envPath = process.env.PRIZES_PATH; // e.g. /app/config/prizes.json

// Where the manager view writes edits (and the preferred file to load from).
// PRIZES_PATH wins; otherwise ./config/prizes.json so it can live on a mounted
// volume that survives container restarts.
const WRITE_TARGET = envPath || localCfg;

// The manager view is only usable when a token is configured. No token => the
// save endpoint is refused, so the editor can't be left accidentally open.
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";

function loadPrizes(): Prize[] {
  const candidates = [envPath, localCfg, bakedIn].filter(Boolean) as string[];
  for (const p of candidates) {
    try {
      if (existsSync(p)) {
        const data = JSON.parse(readFileSync(p, "utf-8")) as Prize[];
        PRIZES_SOURCE = p;
        return data;
      }
    } catch (e) {
      console.warn(`Failed to read ${p}:`, e);
    }
  }
  console.error("No prizes file found; using empty list. Candidates:", candidates);
  PRIZES_SOURCE = "(none)";
  return [];
}

// Mutable: the manager view swaps this out when prizes are saved.
let PRIZES = loadPrizes();

console.log("Prizes loaded:", PRIZES.length, "from:", PRIZES_SOURCE);
console.log("CWD:", process.cwd(), "PRIZES_PATH:", envPath ?? "(unset)");
console.log("Manager view:", ADMIN_TOKEN ? "enabled" : "disabled (set ADMIN_TOKEN)");
console.log("Write target:", WRITE_TARGET);

type Validation =
  | { ok: true; prizes: Prize[] }
  | { ok: false; error: string };

function validatePrizes(input: unknown): Validation {
  if (!Array.isArray(input)) return { ok: false, error: "Expected a JSON array of prizes." };
  if (input.length === 0) return { ok: false, error: "Add at least one prize." };
  if (input.length > 100) return { ok: false, error: "Too many prizes (max 100)." };

  const prizes: Prize[] = [];
  for (const item of input) {
    if (typeof item !== "object" || item === null) {
      return { ok: false, error: "Each prize must be an object with name and value." };
    }
    const name = (item as Record<string, unknown>).name;
    const value = (item as Record<string, unknown>).value;
    if (typeof name !== "string" || name.trim() === "") {
      return { ok: false, error: "Every prize needs a name." };
    }
    if (name.length > 80) {
      return { ok: false, error: `Prize name too long: "${name.slice(0, 20)}…"` };
    }
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      return { ok: false, error: `"${name}" needs a value of 0 or more.` };
    }
    prizes.push({ name: name.trim(), value: Math.round(value) });
  }
  return { ok: true, prizes };
}

function savePrizes(prizes: Prize[]): void {
  mkdirSync(dirname(WRITE_TARGET), { recursive: true });
  writeFileSync(WRITE_TARGET, JSON.stringify(prizes, null, 2) + "\n", "utf-8");
  PRIZES = prizes;
  PRIZES_SOURCE = WRITE_TARGET;
}

const json = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });

serve({
  port: Number(process.env.PORT) || 3000,
  async fetch(req) {
    const url = new URL(req.url);

    const ignorePrefixes = ["/src:", "/file:", "/webpack-internal:", "/@fs/"];
    if (ignorePrefixes.some((p) => url.pathname.startsWith(p))) {
      return new Response(null, { status: 204 });
    }

    if (url.pathname === "/healthz") {
      return new Response("ok", { status: 200 });
    }

    if (url.pathname === "/api/prizes") {
      if (req.method === "GET") return json(PRIZES);

      if (req.method === "POST") {
        if (!ADMIN_TOKEN) {
          return json({ error: "Manager view is disabled. Set ADMIN_TOKEN to enable editing." }, 403);
        }
        if ((req.headers.get("x-admin-token") || "") !== ADMIN_TOKEN) {
          return json({ error: "Wrong password." }, 401);
        }
        let body: unknown;
        try {
          body = await req.json();
        } catch {
          return json({ error: "Body must be valid JSON." }, 400);
        }
        const result = validatePrizes(body);
        if (!result.ok) return json({ error: result.error }, 400);
        try {
          savePrizes(result.prizes);
        } catch (e) {
          console.error("Failed to save prizes:", e);
          return json({ error: "Server couldn't write the prizes file. Check the volume is writable." }, 500);
        }
        console.log(`Prizes updated via manager view: ${result.prizes.length} items`);
        return json({ ok: true, count: result.prizes.length });
      }

      return json({ error: "Method not allowed." }, 405);
    }

    // Lets the manager view tell the difference between wrong-password and
    // editing-disabled before the user tries to save.
    if (url.pathname === "/api/admin/status") {
      return json({ enabled: Boolean(ADMIN_TOKEN) });
    }

    if (url.pathname === "/debug/prizes") {
      return json({
        source: PRIZES_SOURCE,
        count: PRIZES.length,
        writeTarget: WRITE_TARGET,
        adminEnabled: Boolean(ADMIN_TOKEN),
        sample: PRIZES.slice(0, 3),
      });
    }

    if (url.pathname === "/admin") {
      return new Response(Bun.file("./public/admin.html"));
    }

    // Static files. Reject path traversal before touching the filesystem.
    if (url.pathname.includes("..")) {
      return new Response("Not found", { status: 404 });
    }
    const file = url.pathname === "/" ? "/index.html" : url.pathname;
    try {
      return new Response(Bun.file(`./public${file}`));
    } catch {
      return new Response("Not found", { status: 404 });
    }
  },
});

console.log("▶️ http://localhost:3000");
