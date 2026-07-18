// server.ts
import { serve } from "bun";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { fileURLToPath } from "url";



type Prize = { name: string; value: number };

// Track where prizes were actually loaded from (for debugging)
let PRIZES_SOURCE: string = "unknown";


function loadPrizes(): Prize[] {
  const bakedIn = fileURLToPath(new URL("./prizes.json", import.meta.url)); // next to server.ts
  const localCfg = resolve(process.cwd(), "config", "prizes.json");         // ./config/prizes.json
  const envPath = process.env.PRIZES_PATH;                                  // e.g. /app/config/prizes.json

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

const PRIZES = loadPrizes();

console.log("Prizes loaded:", PRIZES.length, "from:", PRIZES_SOURCE);
console.log("CWD:", process.cwd(), "PRIZES_PATH:", process.env.PRIZES_PATH ?? "(unset)");

// const PRIZES: Prize[] = JSON.parse(
//   readFileSync(new URL("./prizes.json", import.meta.url), "utf-8")
// );

serve({
  port: 3000,
  fetch(req) {
    const url = new URL(req.url);

    const ignorePrefixes = ["/src:", "/file:", "/webpack-internal:", "/@fs/"];
    if (ignorePrefixes.some(p => url.pathname.startsWith(p))) {
      return new Response(null, { status: 204 });
    }

    if (url.pathname === "/healthz") {
      return new Response("ok", { status: 200 });
    }

    if (url.pathname === "/api/prizes") {
      return new Response(JSON.stringify(PRIZES), {
        headers: { "Content-Type": "application/json" },
      });
    }

    if (url.pathname === "/debug/prizes") {
      return new Response(
        JSON.stringify({ source: PRIZES_SOURCE, count: PRIZES.length, sample: PRIZES.slice(0, 3) }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    let file = url.pathname === "/" ? "/index.html" : url.pathname;
    try {
      return new Response(Bun.file(`./public${file}`));
    } catch {
      return new Response("Not found", { status: 404 });
    }
  },
});

console.log("▶️ http://localhost:3000");