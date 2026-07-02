import "server-only";
import fs from "fs";
import path from "path";
import {
  LLM_USE_CASE_DEFAULTS,
  maskApiKey,
  isMaskedKeyValue,
  type LlmConfig,
  type LlmConfigPublic,
  type LlmUseCase,
} from "@/lib/llm-config-types";

const CONFIG_PATH = path.join(process.cwd(), "data", "llm-config.json");

function defaultConfig(): LlmConfig {
  return {
    apiKey: "",
    models: { ...LLM_USE_CASE_DEFAULTS },
  };
}

function readApiKeyFromRaw(obj: Record<string, unknown>): string {
  if (typeof obj.apiKey === "string" && obj.apiKey.trim()) {
    return obj.apiKey.trim();
  }
  if (Array.isArray(obj.apiKeys)) {
    for (const k of obj.apiKeys) {
      if (typeof k === "string" && k.trim()) return k.trim();
    }
  }
  return "";
}

function normalizeConfig(raw: unknown): LlmConfig {
  const base = defaultConfig();
  if (!raw || typeof raw !== "object") return base;
  const obj = raw as Record<string, unknown>;

  const apiKey = readApiKeyFromRaw(obj);

  const models = { ...base.models };
  if (obj.models && typeof obj.models === "object") {
    for (const useCase of Object.keys(LLM_USE_CASE_DEFAULTS) as LlmUseCase[]) {
      const val = (obj.models as Record<string, unknown>)[useCase];
      if (typeof val === "string" && val.trim()) {
        models[useCase] = val.trim();
      }
    }
  }

  return { apiKey, models };
}

export function loadLlmConfig(): LlmConfig {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
      return normalizeConfig(raw);
    }
  } catch {
    /* use defaults */
  }
  return defaultConfig();
}

export function saveLlmConfig(config: LlmConfig): void {
  const dir = path.dirname(CONFIG_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const normalized = normalizeConfig(config);
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(normalized, null, 2), "utf-8");
}

/** @deprecated Sin caché en memoria; lectura siempre desde disco. */
export function invalidateLlmConfigCache(): void {
  /* no-op */
}

export function getApiKey(): string {
  const fromFile = loadLlmConfig().apiKey.trim();
  if (fromFile) return fromFile;

  const envKey = process.env.OPENROUTER_API_KEY?.trim();
  if (envKey) return envKey;

  throw new Error(
    "No hay API key de OpenRouter configurada. Añádala en Configurar LLM o en OPENROUTER_API_KEY."
  );
}

export function resolveModelForUseCase(useCase: LlmUseCase, override?: string): string {
  if (override?.trim()) return override.trim();

  const fromConfig = loadLlmConfig().models[useCase]?.trim();
  if (fromConfig) return fromConfig;

  const envMap: Partial<Record<LlmUseCase, string | undefined>> = {
    chat: process.env.OPENROUTER_MODEL,
    router: process.env.OPENROUTER_MODEL,
    agent: process.env.OPENROUTER_MODEL,
    evaluate: process.env.OPENROUTER_MODEL,
    extract: process.env.OPENROUTER_MODEL,
    vision: process.env.OPENROUTER_EXTRACT_MODEL,
    embeddings: process.env.OPENROUTER_EMBEDDING_MODEL,
  };
  const fromEnv = envMap[useCase]?.trim();
  if (fromEnv) return fromEnv;

  return LLM_USE_CASE_DEFAULTS[useCase];
}

export function getLlmConfigPublic(): LlmConfigPublic {
  const config = loadLlmConfig();
  const envKey = process.env.OPENROUTER_API_KEY?.trim();
  const hasFileKey = !!config.apiKey.trim();
  return {
    apiKey: hasFileKey ? maskApiKey(config.apiKey) : "",
    models: { ...config.models },
    hasApiKey: hasFileKey || !!envKey,
    usesEnvFallback: !hasFileKey && !!envKey,
  };
}

export function mergeApiKeyFromClient(incoming: string, existing: string): string {
  const inc = incoming.trim();
  if (!inc) return "";
  if (isMaskedKeyValue(inc) && existing.trim()) return existing.trim();
  return inc;
}
