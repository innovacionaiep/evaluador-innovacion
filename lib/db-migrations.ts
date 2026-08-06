/**
 * Versioned schema bootstrap + legacy backfills for Postgres.
 * Kept separate from query helpers in db-postgres.ts.
 */
import type postgres from "postgres";
import { mergeRubricConfig } from "@/lib/rubric-config";
import { mergeReportFormatConfig } from "@/lib/report-format-config";
import {
  buildEvaluationConfigFromLegacy,
  isEvaluationConfigEmpty,
} from "@/lib/evaluation-config";

export async function runPostgresMigrations(
  sql: ReturnType<typeof postgres>
): Promise<void> {
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
      rubric_prompt TEXT DEFAULT ''
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

  // Backfill evaluation_config desde pipeline/report/rag (sin depender de instructions, ya retirada).
  const legacyRows = (await sql`
    SELECT c.evaluation_type_id, t.name,
           c.evaluation_config, c.pipeline_config, c.report_format_config, c.rag_config,
           c.rubric_config
    FROM evaluation_type_config c
    JOIN evaluation_types t ON t.id = c.evaluation_type_id
  `) as unknown as {
    evaluation_type_id: number;
    name: string;
    evaluation_config: unknown;
    pipeline_config: unknown;
    report_format_config: unknown;
    rag_config: unknown;
    rubric_config: unknown;
  }[];

  for (const row of legacyRows) {
    if (!isEvaluationConfigEmpty(row.evaluation_config)) continue;
    const rubric = mergeRubricConfig(row.rubric_config, row.name);
    const reportFormat = mergeReportFormatConfig(row.report_format_config, rubric);
    const evaluationConfig = buildEvaluationConfigFromLegacy(
      {
        pipeline_config: row.pipeline_config,
        report_format_config: reportFormat,
        rag_config: row.rag_config,
      },
      row.name
    );
    await sql`
      UPDATE evaluation_type_config
      SET evaluation_config = ${sql.json(evaluationConfig)}
      WHERE evaluation_type_id = ${row.evaluation_type_id}
    `;
  }

  // Limpieza legacy: la columna instructions ya no se usa.
  await sql`ALTER TABLE evaluation_type_config DROP COLUMN IF EXISTS instructions`;
  await sql`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS evaluation_history (
      id SERIAL PRIMARY KEY,
      evaluation_type_id INTEGER REFERENCES evaluation_types(id) ON DELETE SET NULL,
      evaluation_type_name TEXT NOT NULL,
      project_name TEXT NOT NULL,
      file_name TEXT DEFAULT '',
      report_content TEXT NOT NULL,
      subdimension_scores JSONB NOT NULL DEFAULT '{}',
      overall_score DOUBLE PRECISION,
      summary TEXT DEFAULT '',
      score_schema JSONB NOT NULL DEFAULT '[]',
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `;
}
