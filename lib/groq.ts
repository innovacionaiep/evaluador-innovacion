import Groq from "groq-sdk";

const model = "qwen/qwen3-32b";

export function getGroqClient(): Groq {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not set in environment");
  }
  return new Groq({ apiKey });
}

export async function* streamChat(
  messages: { role: "system" | "user" | "assistant"; content: string }[],
  options?: { temperature?: number; max_tokens?: number }
): AsyncGenerator<string, void, unknown> {
  const client = getGroqClient();
  const maxTokens = options?.max_tokens ?? 8192;
  const totalContentChars = messages.reduce((sum, m) => sum + (m.content?.length ?? 0), 0);
  // #region agent log
  fetch("http://127.0.0.1:7243/ingest/2cfbb0df-8ae8-4230-9f25-74fe2cc0dcdd", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      location: "groq.ts:streamChat",
      message: "Before chat.completions.create",
      data: { totalContentChars, messageCount: messages.length, max_tokens: maxTokens },
      timestamp: Date.now(),
      hypothesisId: "H2,H5",
    }),
  }).catch(() => {});
  // #endregion
  let stream;
  try {
    stream = await client.chat.completions.create({
      model,
      messages,
      stream: true,
      temperature: options?.temperature ?? 0.3,
      max_tokens: maxTokens,
    });
  } catch (createErr) {
    // #region agent log
    const createErrMsg = createErr instanceof Error ? createErr.message : String(createErr);
    fetch("http://127.0.0.1:7243/ingest/2cfbb0df-8ae8-4230-9f25-74fe2cc0dcdd", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: "groq.ts:streamChat create error",
        message: "chat.completions.create threw",
        data: { errorMessage: createErrMsg },
        timestamp: Date.now(),
        hypothesisId: "H5",
      }),
    }).catch(() => {});
    // #endregion
    throw createErr;
  }

  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content;
    if (content) yield content;
  }
}

export { model as GROQ_MODEL };
