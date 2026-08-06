import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertKnowledgeUploadPathname,
  parseKnowledgeClientPayload,
} from "@/lib/upload-client-auth";

describe("upload-client-auth pure guards", () => {
  it("accepts valid knowledge path", () => {
    assert.doesNotThrow(() =>
      assertKnowledgeUploadPathname("knowledge/3/manual.pdf", 3)
    );
  });

  it("rejects wrong type prefix", () => {
    assert.throws(
      () => assertKnowledgeUploadPathname("knowledge/9/manual.pdf", 3),
      /Ruta de subida inválida/
    );
  });

  it("rejects path traversal", () => {
    assert.throws(
      () => assertKnowledgeUploadPathname("knowledge/3/../../etc/passwd", 3),
      /Ruta de subida inválida/
    );
  });

  it("rejects disallowed extension", () => {
    assert.throws(
      () => assertKnowledgeUploadPathname("knowledge/3/evil.exe", 3),
      /Tipo de archivo no permitido/
    );
  });

  it("parseKnowledgeClientPayload requires knowledge kind", () => {
    const p = parseKnowledgeClientPayload(
      JSON.stringify({ kind: "knowledge", evaluationTypeId: 1 })
    );
    assert.equal(p.kind, "knowledge");
    assert.equal(p.evaluationTypeId, 1);
    assert.throws(() => parseKnowledgeClientPayload("{"), /Payload de subida inválido/);
  });
});
