/**
 * OpenRouter API (OpenAI-compatible). https://openrouter.ai/
 * Uses OPENROUTER_API_KEY and the model id (default: openrouter/free).
 */

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
const DEFAULT_MODEL = "openrouter/free";
const EXTRACT_VISION_MODEL = "openrouter/free";
const DEFAULT_EMBEDDING_MODEL = "nvidia/llama-nemotron-embed-vl-1b-v2:free";
const EMBEDDING_BATCH_SIZE = 16;

function openRouterHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  };
}

/** Reintentos ante 429 (rate limit) y 402 (límite de gasto / proveedor gratuito). */
const MAX_LLM_RETRIES = 4;
const RETRY_BASE_MS = 2000;

function getApiKey(): string {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key?.trim()) {
    throw new Error("OPENROUTER_API_KEY is not set in environment");
  }
  return key.trim();
}

/** Errores que OpenRouter puede resolver en otro intento (429 rate limit, 402 spend limit). */
function isRetryableProviderError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes("429") || msg.includes("402");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function* streamChat(
  messages: { role: "system" | "user" | "assistant"; content: string }[],
  options?: { temperature?: number; max_tokens?: number; model?: string }
): AsyncGenerator<string, void, unknown> {
  const apiKey = getApiKey();
  const model = options?.model ?? process.env.OPENROUTER_MODEL ?? DEFAULT_MODEL;
  const maxTokens = options?.max_tokens ?? 8192;
  const temperature = options?.temperature ?? 0.3;

  let res: Response;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_LLM_RETRIES; attempt++) {
    try {
      res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
        method: "POST",
        headers: openRouterHeaders(apiKey),
        body: JSON.stringify({
          model,
          messages,
          stream: true,
          max_tokens: maxTokens,
          temperature,
        }),
      });
      if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`${res.status} ${errBody}`);
      }
      lastErr = null;
      break;
    } catch (e) {
      lastErr = e;
      if (!isRetryableProviderError(e) || attempt === MAX_LLM_RETRIES) throw e;
      await sleep(RETRY_BASE_MS * Math.pow(2, attempt - 1));
    }
  }
  if (lastErr != null) throw lastErr;
  const reader = res!.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const data = line.slice(6);
        if (data === "[DONE]") continue;
        try {
          const json = JSON.parse(data);
          const content = json.choices?.[0]?.delta?.content;
          if (typeof content === "string") yield content;
        } catch {
          /* ignore malformed chunk */
        }
      }
    }
  }
}

export type ChatStreamPart = { kind: "content" | "thinking"; text: string };

const THINK_END_RE = /<\/think>|<\/redacted_thinking>/i;
const THINK_START_RE = /<think>|<think>/i;
const PARTIAL_TAG_RE = /<(?:\/?think(?:ing)?|redacted_thinking)?$/i;

/** Separa razonamiento (etiquetas think / delta.reasoning) del contenido visible. */
function* flushThinkSplitter(
  splitter: { inThink: boolean; carry: string },
  delta: string
): Generator<ChatStreamPart> {
  splitter.carry += delta;
  while (splitter.carry.length > 0) {
    if (splitter.inThink) {
      const endMatch = splitter.carry.match(THINK_END_RE);
      if (endMatch && endMatch.index !== undefined) {
        const thinkPart = splitter.carry.slice(0, endMatch.index);
        if (thinkPart) yield { kind: "thinking", text: thinkPart };
        splitter.carry = splitter.carry.slice(endMatch.index + endMatch[0].length);
        splitter.inThink = false;
        continue;
      }
      if (splitter.carry.length > 40) {
        yield { kind: "thinking", text: splitter.carry.slice(0, -30) };
        splitter.carry = splitter.carry.slice(-30);
      }
      break;
    }

    const startMatch = splitter.carry.match(THINK_START_RE);
    if (startMatch && startMatch.index !== undefined) {
      const before = splitter.carry.slice(0, startMatch.index);
      if (before) yield { kind: "content", text: before };
      splitter.carry = splitter.carry.slice(startMatch.index + startMatch[0].length);
      splitter.inThink = true;
      continue;
    }

    const partial = splitter.carry.match(PARTIAL_TAG_RE);
    if (partial && partial.index !== undefined && partial.index > 0) {
      yield { kind: "content", text: splitter.carry.slice(0, partial.index) };
      splitter.carry = splitter.carry.slice(partial.index);
      break;
    }
    if (partial) break;

    yield { kind: "content", text: splitter.carry };
    splitter.carry = "";
  }
}

function* drainThinkSplitter(splitter: { inThink: boolean; carry: string }): Generator<ChatStreamPart> {
  if (!splitter.carry) return;
  yield { kind: splitter.inThink ? "thinking" : "content", text: splitter.carry };
  splitter.carry = "";
}

/** Igual que streamChat pero distingue razonamiento (thinking) de la respuesta final. */
export async function* streamChatDetailed(
  messages: { role: "system" | "user" | "assistant"; content: string }[],
  options?: { temperature?: number; max_tokens?: number; model?: string }
): AsyncGenerator<ChatStreamPart, void, unknown> {
  const apiKey = getApiKey();
  const model = options?.model ?? process.env.OPENROUTER_MODEL ?? DEFAULT_MODEL;
  const maxTokens = options?.max_tokens ?? 8192;
  const temperature = options?.temperature ?? 0.3;

  let res: Response;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_LLM_RETRIES; attempt++) {
    try {
      res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
        method: "POST",
        headers: openRouterHeaders(apiKey),
        body: JSON.stringify({
          model,
          messages,
          stream: true,
          max_tokens: maxTokens,
          temperature,
        }),
      });
      if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`${res.status} ${errBody}`);
      }
      lastErr = null;
      break;
    } catch (e) {
      lastErr = e;
      if (!isRetryableProviderError(e) || attempt === MAX_LLM_RETRIES) throw e;
      await sleep(RETRY_BASE_MS * Math.pow(2, attempt - 1));
    }
  }
  if (lastErr != null) throw lastErr;

  const reader = res!.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";
  const splitter = { inThink: false, carry: "" };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6);
      if (data === "[DONE]") continue;
      try {
        const json = JSON.parse(data);
        const delta = json.choices?.[0]?.delta;
        const reasoning =
          (typeof delta?.reasoning === "string" && delta.reasoning) ||
          (typeof delta?.reasoning_content === "string" && delta.reasoning_content);
        if (reasoning) yield { kind: "thinking", text: reasoning };

        const content = delta?.content;
        if (typeof content === "string" && content) {
          yield* flushThinkSplitter(splitter, content);
        }
      } catch {
        /* ignore malformed chunk */
      }
    }
  }
  yield* drainThinkSplitter(splitter);
}

export type VisionMessageContent =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

/** Chat completion with vision (no stream). For document extraction. */
export async function chatCompletionVision(
  messages: { role: "system" | "user" | "assistant"; content: string | VisionMessageContent[] }[],
  options?: { max_tokens?: number; model?: string }
): Promise<string> {
  const apiKey = getApiKey();
  const model =
    options?.model ??
    process.env.OPENROUTER_EXTRACT_MODEL ??
    EXTRACT_VISION_MODEL;
  const maxTokens = options?.max_tokens ?? 4096;

  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_LLM_RETRIES; attempt++) {
    try {
      const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
        method: "POST",
        headers: openRouterHeaders(apiKey),
        body: JSON.stringify({
          model,
          messages,
          stream: false,
          max_tokens: maxTokens,
        }),
      });
      if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`${res.status} ${errBody}`);
      }
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const content = data.choices?.[0]?.message?.content;
      return typeof content === "string" ? content : "";
    } catch (e) {
      lastErr = e;
      if (!isRetryableProviderError(e) || attempt === MAX_LLM_RETRIES) throw e;
      await sleep(RETRY_BASE_MS * Math.pow(2, attempt - 1));
    }
  }
  throw lastErr;
}

/** One-shot text completion (no stream, no vision). For structuring text. */
export async function chatCompletion(
  messages: { role: "system" | "user" | "assistant"; content: string }[],
  options?: { max_tokens?: number; model?: string }
): Promise<string> {
  const apiKey = getApiKey();
  const model = options?.model ?? process.env.OPENROUTER_MODEL ?? DEFAULT_MODEL;
  const maxTokens = options?.max_tokens ?? 4096;

  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_LLM_RETRIES; attempt++) {
    try {
      const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
        method: "POST",
        headers: openRouterHeaders(apiKey),
        body: JSON.stringify({
          model,
          messages,
          stream: false,
          max_tokens: maxTokens,
        }),
      });
      if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`${res.status} ${errBody}`);
      }
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const content = data.choices?.[0]?.message?.content;
      return typeof content === "string" ? content : "";
    } catch (e) {
      lastErr = e;
      if (!isRetryableProviderError(e) || attempt === MAX_LLM_RETRIES) throw e;
      await sleep(RETRY_BASE_MS * Math.pow(2, attempt - 1));
    }
  }
  throw lastErr;
}

type EmbeddingResponse = {
  data?: { index: number; embedding: number[] }[];
};

/** Generate embeddings for one or more texts (RAG indexing and retrieval). */
export async function createEmbeddings(
  input: string[],
  options?: { model?: string }
): Promise<number[][]> {
  if (input.length === 0) return [];
  const apiKey = getApiKey();
  const model = options?.model ?? process.env.OPENROUTER_EMBEDDING_MODEL ?? DEFAULT_EMBEDDING_MODEL;

  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_LLM_RETRIES; attempt++) {
    try {
      const res = await fetch(`${OPENROUTER_BASE}/embeddings`, {
        method: "POST",
        headers: openRouterHeaders(apiKey),
        body: JSON.stringify({ model, input }),
      });
      if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`${res.status} ${errBody}`);
      }
      const data = (await res.json()) as EmbeddingResponse;
      const rows = (data.data ?? []).slice().sort((a, b) => a.index - b.index);
      return rows.map((row) => row.embedding ?? []);
    } catch (e) {
      lastErr = e;
      if (!isRetryableProviderError(e) || attempt === MAX_LLM_RETRIES) throw e;
      await sleep(RETRY_BASE_MS * Math.pow(2, attempt - 1));
    }
  }
  throw lastErr;
}

/** Batch embeddings for RAG (chunk indexing). */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const results: number[][] = [];
  for (let i = 0; i < texts.length; i += EMBEDDING_BATCH_SIZE) {
    const batch = texts.slice(i, i + EMBEDDING_BATCH_SIZE).map((t) => t?.trim() || " ");
    const vectors = await createEmbeddings(batch);
    results.push(...vectors);
  }
  return results;
}

/** Single-query embedding for RAG retrieval. */
export async function embedQuery(query: string): Promise<number[]> {
  const vectors = await embedTexts([query.trim() || " "]);
  return vectors[0] ?? [];
}

export { DEFAULT_MODEL as OPENROUTER_DEFAULT_MODEL, DEFAULT_EMBEDDING_MODEL as OPENROUTER_DEFAULT_EMBEDDING_MODEL };
