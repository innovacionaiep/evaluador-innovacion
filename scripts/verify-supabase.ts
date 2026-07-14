#!/usr/bin/env npx tsx
/** Verifica que DATABASE_URL apunta al Supabase esperado y tiene datos. */
import fs from "fs";
import path from "path";
import postgres from "postgres";
import { normalizeDatabaseUrl } from "../lib/database-url";

function loadEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  const raw = fs.readFileSync(envPath, "utf8").replace(/^\uFEFF/, "");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.replace(/^\uFEFF/, "").trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined || process.env[key] === "") {
      process.env[key] = value;
    }
  }
}

async function main() {
  loadEnvLocal();
  const raw = process.env.DATABASE_URL;
  if (!raw) {
    console.error("Falta DATABASE_URL");
    process.exit(1);
  }
  const url = normalizeDatabaseUrl(raw);
  const ref = (url.match(/postgres\.([a-z0-9]+)/i) || [])[1] || "?";
  const sql = postgres(url, { ssl: "require", prepare: false, max: 1 });
  try {
    const types = await sql`SELECT id, name FROM evaluation_types ORDER BY id`;
    const settings = await sql`SELECT key FROM app_settings ORDER BY key`;
    console.log(`DATABASE_URL → ${ref}`);
    console.log(
      `tipos (${types.length}):`,
      types.map((t) => `${t.id}:${t.name}`).join(" | ")
    );
    console.log(
      `settings (${settings.length}):`,
      settings.map((s) => s.key).join(", ")
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
