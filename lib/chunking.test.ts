import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { chunkText, hardSplitText, EMBEDDING_MAX_INPUT_CHARS } from "@/lib/chunking";

describe("chunking", () => {
  it("hardSplitText respeta el máximo", () => {
    const text = "a".repeat(2500);
    const parts = hardSplitText(text, 1000, 100);
    assert.ok(parts.length >= 3);
    for (const p of parts) {
      assert.ok(p.length <= 1000, `parte demasiado larga: ${p.length}`);
    }
  });

  it("nunca emite fragmentos mayores que chunkSize (frase larga sin puntuación)", () => {
    const monster = "palabra ".repeat(5000).trim(); // ~40k chars, sin .!?
    const chunks = chunkText(monster, "doc.pdf", { chunkSizeChars: 1000, overlapChars: 100 });
    assert.ok(chunks.length > 10);
    for (const c of chunks) {
      assert.ok(c.text.length <= 1000, `chunk ${c.index} len=${c.text.length}`);
    }
  });

  it("capa el tamaño efectivo al máximo de embeddings", () => {
    const monster = "x".repeat(EMBEDDING_MAX_INPUT_CHARS + 5000);
    const chunks = chunkText(monster, "big.pdf", {
      chunkSizeChars: 8000,
      overlapChars: 200,
    });
    for (const c of chunks) {
      assert.ok(
        c.text.length <= EMBEDDING_MAX_INPUT_CHARS,
        `chunk ${c.index} len=${c.text.length} > ${EMBEDDING_MAX_INPUT_CHARS}`
      );
    }
  });

  it("EMBEDDING_MAX_INPUT_CHARS queda bajo el techo típico 8192 tokens", () => {
    // Peor caso ~1.5 tokens/carácter → 3500*1.5=5250 < 8192
    assert.ok(EMBEDDING_MAX_INPUT_CHARS * 1.5 < 8192);
  });
});
