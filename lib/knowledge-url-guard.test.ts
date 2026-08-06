import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isAllowedKnowledgeUrl } from "@/lib/knowledge-url-guard";

describe("knowledge-register URL smoke", () => {
  it("allows https blob path for the type", () => {
    assert.equal(
      isAllowedKnowledgeUrl(
        "https://abc.public.blob.vercel-storage.com/knowledge/2/doc.pdf",
        2
      ),
      true
    );
  });

  it("rejects http and foreign paths", () => {
    assert.equal(
      isAllowedKnowledgeUrl("http://evil.example/knowledge/2/x.pdf", 2),
      false
    );
    assert.equal(
      isAllowedKnowledgeUrl(
        "https://abc.public.blob.vercel-storage.com/knowledge/9/doc.pdf",
        2
      ),
      false
    );
  });
});
