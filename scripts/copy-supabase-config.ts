#!/usr/bin/env npx tsx
/**
 * Copia la configuración de la app entre dos proyectos Supabase.
 *
 * Tablas: evaluation_types, evaluation_type_config, app_settings
 *
 * Uso:
 *   1. En .env.local deja DATABASE_URL = proyecto ORIGEN (viejo)
 *   2. Añade DATABASE_URL_NEW = proyecto DESTINO (nuevo), pooler puerto 6543
 *   3. npx tsx scripts/copy-supabase-config.ts
 *
 * Opciones:
 *   --force  Si el destino ya tiene tipos, los borra y reemplaza
 */
import fs from "fs";
import path from "path";
import postgres from "postgres";
import { normalizeDatabaseUrl } from "../lib/database-url";

function loadEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  // Quitar BOM UTF-8 si PowerShell añadió uno al guardar/append
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
    // .env.local manda sobre env vacío; no pisa valores ya exportados en shell
    if (process.env[key] === undefined || process.env[key] === "") {
      process.env[key] = value;
    }
  }
}

function projectRef(url: string): string {
  try {
    const u = new URL(url);
    const user = decodeURIComponent(u.username || "");
    const m = user.match(/postgres\.([a-z0-9]+)/i);
    if (m) return m[1];
    return u.hostname;
  } catch {
    return "(url inválida)";
  }
}

async function ensureSchema(sql: ReturnType<typeof postgres>) {
  await sql`
    CREATE TABLE IF NOT EXISTS evaluation_types (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS evaluation_type_config (
      evaluation_type_id INTEGER PRIMARY KEY REFERENCES evaluation_types(id) ON DELETE CASCADE,
      prompt TEXT DEFAULT '',
      knowledge_paths JSONB DEFAULT '[]',
      rubric_path TEXT DEFAULT '',
      elements JSONB DEFAULT '[]',
      report_format TEXT DEFAULT '',
      rubric_prompt TEXT DEFAULT '',
      pipeline_config JSONB DEFAULT '{}',
      rag_config JSONB DEFAULT '{}',
      extract_config JSONB DEFAULT '{}',
      rubric_config JSONB DEFAULT '{}',
      report_format_config JSONB DEFAULT '{}',
      evaluation_config JSONB DEFAULT '{}'
    )
  `;
  await sql`ALTER TABLE evaluation_type_config ADD COLUMN IF NOT EXISTS elements JSONB DEFAULT '[]'`;
  await sql`ALTER TABLE evaluation_type_config ADD COLUMN IF NOT EXISTS report_format TEXT DEFAULT ''`;
  await sql`ALTER TABLE evaluation_type_config ADD COLUMN IF NOT EXISTS rubric_prompt TEXT DEFAULT ''`;
  await sql`ALTER TABLE evaluation_type_config ADD COLUMN IF NOT EXISTS pipeline_config JSONB DEFAULT '{}'`;
  await sql`ALTER TABLE evaluation_type_config ADD COLUMN IF NOT EXISTS rag_config JSONB DEFAULT '{}'`;
  await sql`ALTER TABLE evaluation_type_config ADD COLUMN IF NOT EXISTS extract_config JSONB DEFAULT '{}'`;
  await sql`ALTER TABLE evaluation_type_config ADD COLUMN IF NOT EXISTS rubric_config JSONB DEFAULT '{}'`;
  await sql`ALTER TABLE evaluation_type_config ADD COLUMN IF NOT EXISTS report_format_config JSONB DEFAULT '{}'`;
  await sql`ALTER TABLE evaluation_type_config ADD COLUMN IF NOT EXISTS evaluation_config JSONB DEFAULT '{}'`;
  await sql`ALTER TABLE evaluation_type_config DROP COLUMN IF EXISTS instructions`;
  await sql`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL
    )
  `;
}

async function main() {
  loadEnvLocal();
  const force = process.argv.includes("--force");

  const rawSource = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  const rawTarget = process.env.DATABASE_URL_NEW;

  if (!rawSource) {
    console.error("Falta DATABASE_URL (origen) en .env.local");
    process.exit(1);
  }
  if (!rawTarget) {
    console.error(
      "Falta DATABASE_URL_NEW (destino) en .env.local.\n" +
        "Añade la URI Transaction pooler (:6543) del proyecto Supabase NUEVO."
    );
    process.exit(1);
  }

  const sourceUrl = normalizeDatabaseUrl(rawSource);
  const targetUrl = normalizeDatabaseUrl(rawTarget);

  if (projectRef(sourceUrl) === projectRef(targetUrl)) {
    console.error("Origen y destino parecen el mismo proyecto. Revisa las URLs.");
    process.exit(1);
  }

  console.log(`Origen:  ${projectRef(sourceUrl)}`);
  console.log(`Destino: ${projectRef(targetUrl)}`);

  const source = postgres(sourceUrl, { ssl: "require", prepare: false, max: 1 });
  const target = postgres(targetUrl, { ssl: "require", prepare: false, max: 1 });

  try {
    await ensureSchema(target);

    const types = await source`
      SELECT id, name, created_at, updated_at FROM evaluation_types ORDER BY id
    `;
    const configs = await source`
      SELECT * FROM evaluation_type_config ORDER BY evaluation_type_id
    `;
    const settings = await source`SELECT key, value FROM app_settings ORDER BY key`;

    console.log(`\nA copiar:`);
    console.log(`  evaluation_types:        ${types.length}`);
    console.log(`  evaluation_type_config:  ${configs.length}`);
    console.log(`  app_settings:            ${settings.length}`);

    if (types.length === 0 && settings.length === 0) {
      console.warn("El origen está vacío. Nada que copiar.");
      return;
    }

    const destCount = await target`SELECT COUNT(*)::int AS n FROM evaluation_types`;
    const n = Number(destCount[0]?.n ?? 0);
    if (n > 0 && !force) {
      console.error(
        `\nEl destino ya tiene ${n} tipo(s). Re-ejecuta con --force para reemplazar,\n` +
          `o bórralos antes en Supabase Table Editor.`
      );
      process.exit(1);
    }

    await target.begin(async (tx) => {
      if (n > 0 && force) {
        await tx`DELETE FROM evaluation_type_config`;
        await tx`DELETE FROM evaluation_types`;
        await tx`DELETE FROM app_settings`;
        console.log("Destino limpiado (--force).");
      }

      for (const t of types) {
        await tx`
          INSERT INTO evaluation_types (id, name, created_at, updated_at)
          VALUES (${t.id}, ${t.name}, ${t.created_at}, ${t.updated_at})
        `;
      }

      for (const c of configs) {
        await tx`
          INSERT INTO evaluation_type_config (
            evaluation_type_id, prompt, knowledge_paths, rubric_path, elements,
            report_format, rubric_prompt, pipeline_config, rag_config, extract_config,
            rubric_config, report_format_config, evaluation_config
          ) VALUES (
            ${c.evaluation_type_id},
            ${c.prompt ?? ""},
            ${tx.json(c.knowledge_paths ?? [])},
            ${c.rubric_path ?? ""},
            ${tx.json(c.elements ?? [])},
            ${c.report_format ?? ""},
            ${c.rubric_prompt ?? ""},
            ${tx.json(c.pipeline_config ?? {})},
            ${tx.json(c.rag_config ?? {})},
            ${tx.json(c.extract_config ?? {})},
            ${tx.json(c.rubric_config ?? {})},
            ${tx.json(c.report_format_config ?? {})},
            ${tx.json(c.evaluation_config ?? {})}
          )
        `;
      }

      for (const s of settings) {
        await tx`
          INSERT INTO app_settings (key, value)
          VALUES (${s.key}, ${tx.json(s.value)})
          ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
        `;
      }

      if (types.length > 0) {
        const maxId = Math.max(...types.map((t) => Number(t.id)));
        await tx`SELECT setval(pg_get_serial_sequence('evaluation_types', 'id'), ${maxId})`;
      }
    });

    const checkTypes = await target`SELECT COUNT(*)::int AS n FROM evaluation_types`;
    const checkSettings = await target`SELECT COUNT(*)::int AS n FROM app_settings`;
    console.log(`\nListo en destino:`);
    console.log(`  evaluation_types: ${checkTypes[0]?.n}`);
    console.log(`  app_settings:     ${checkSettings[0]?.n}`);
    console.log(
      `\nNota: knowledge_paths sigue apuntando al Blob VIEJO.\n` +
        `Cuando migremos Blob, habrá que re-subir PDFs o reasignar URLs.`
    );
  } finally {
    await source.end({ timeout: 5 });
    await target.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
