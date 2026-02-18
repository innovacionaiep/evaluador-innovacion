import { DatabaseSync } from "node:sqlite";
import path from "path";
import fs from "fs";
import * as pg from "./db-postgres";

const dataDir = path.join(process.cwd(), "data");
const dbPath = path.join(dataDir, "evaluador.db");

function usePostgres(): boolean {
  return typeof process !== "undefined" && !!(process.env.DATABASE_URL || process.env.POSTGRES_URL);
}

function getDb(): DatabaseSync {
  // #region agent log
  if (typeof fetch === "function") {
    fetch("http://127.0.0.1:7243/ingest/2cfbb0df-8ae8-4230-9f25-74fe2cc0dcdd", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: "lib/db.ts:getDb",
        message: "getDb called",
        data: { cwd: process.cwd(), dbPath },
        timestamp: Date.now(),
        hypothesisId: "H3",
      }),
    }).catch(() => {});
  }
  // #endregion
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  return new DatabaseSync(dbPath);
}

function initDbSync() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS evaluation_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS evaluation_type_config (
      evaluation_type_id INTEGER PRIMARY KEY,
      prompt TEXT DEFAULT '',
      knowledge_paths TEXT DEFAULT '[]',
      rubric_path TEXT DEFAULT '',
      FOREIGN KEY (evaluation_type_id) REFERENCES evaluation_types(id) ON DELETE CASCADE
    );
  `);
}

export type ConfigRow = {
  evaluation_type_id: number;
  prompt: string;
  knowledge_paths: string;
  rubric_path: string;
};

export type EvaluationTypeRow = {
  id: number;
  name: string;
  created_at: string;
  updated_at: string;
};

// --- Async API (use from API routes and server code) ---

export async function initDb(): Promise<void> {
  if (usePostgres()) {
    await pg.initDbPostgres();
  } else {
    initDbSync();
  }
}

export async function getEvaluationTypes(): Promise<EvaluationTypeRow[]> {
  if (usePostgres()) {
    return pg.getEvaluationTypesPostgres();
  }
  const db = getDb();
  const rows = db
    .prepare("SELECT id, name, created_at, updated_at FROM evaluation_types ORDER BY id")
    .all() as EvaluationTypeRow[];
  return rows;
}

export async function getEvaluationTypeById(id: number): Promise<EvaluationTypeRow | null> {
  if (usePostgres()) {
    return pg.getEvaluationTypeByIdPostgres(id);
  }
  const db = getDb();
  const row = db
    .prepare("SELECT id, name, created_at, updated_at FROM evaluation_types WHERE id = ?")
    .get(id) as EvaluationTypeRow | undefined;
  return row ?? null;
}

export async function createEvaluationType(name: string): Promise<number> {
  if (usePostgres()) {
    return pg.createEvaluationTypePostgres(name);
  }
  const db = getDb();
  const insert = db.prepare("INSERT INTO evaluation_types (name) VALUES (?)");
  const runResult = insert.run(name) as { lastInsertRowid: number };
  const id = Number(runResult.lastInsertRowid);
  db.prepare("INSERT INTO evaluation_type_config (evaluation_type_id, prompt) VALUES (?, '')").run(id);
  return id;
}

export async function updateEvaluationType(id: number, name: string): Promise<void> {
  if (usePostgres()) {
    await pg.updateEvaluationTypePostgres(id, name);
    return;
  }
  const db = getDb();
  db.prepare("UPDATE evaluation_types SET name = ?, updated_at = datetime('now') WHERE id = ?").run(name, id);
}

export async function deleteEvaluationType(id: number): Promise<void> {
  if (usePostgres()) {
    await pg.deleteEvaluationTypePostgres(id);
    return;
  }
  const db = getDb();
  db.prepare("DELETE FROM evaluation_type_config WHERE evaluation_type_id = ?").run(id);
  db.prepare("DELETE FROM evaluation_types WHERE id = ?").run(id);
}

export async function getConfig(evaluationTypeId: number): Promise<ConfigRow | null> {
  if (usePostgres()) {
    return pg.getConfigPostgres(evaluationTypeId);
  }
  const db = getDb();
  const row = db
    .prepare(
      "SELECT evaluation_type_id, prompt, knowledge_paths, rubric_path FROM evaluation_type_config WHERE evaluation_type_id = ?"
    )
    .get(evaluationTypeId) as ConfigRow | undefined;
  return row ?? null;
}

export async function updateConfig(
  evaluationTypeId: number,
  data: { prompt?: string; knowledge_paths?: (string | { name: string; url: string })[]; rubric_path?: string }
): Promise<void> {
  if (usePostgres()) {
    await pg.updateConfigPostgres(evaluationTypeId, data);
    return;
  }
  const db = getDb();
  const current = db
    .prepare("SELECT prompt, knowledge_paths, rubric_path FROM evaluation_type_config WHERE evaluation_type_id = ?")
    .get(evaluationTypeId) as { prompt: string; knowledge_paths: string; rubric_path: string } | undefined;
  if (!current) return;
  const prompt = data.prompt !== undefined ? data.prompt : current.prompt;
  const knowledge_paths =
    data.knowledge_paths !== undefined ? JSON.stringify(data.knowledge_paths) : current.knowledge_paths;
  const rubric_path = data.rubric_path !== undefined ? data.rubric_path : current.rubric_path;
  db
    .prepare(
      "UPDATE evaluation_type_config SET prompt = ?, knowledge_paths = ?, rubric_path = ? WHERE evaluation_type_id = ?"
    )
    .run(prompt, knowledge_paths, rubric_path, evaluationTypeId);
}

export { getDb };
