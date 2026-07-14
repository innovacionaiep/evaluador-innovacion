import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeDatabaseUrl } from "./database-url";

describe("normalizeDatabaseUrl", () => {
  it("encodes ampersands in password", () => {
    const raw =
      "postgresql://postgres.exampleproj:&WC&SecretPass@aws-1-sa-east-1.pooler.supabase.com:6543/postgres";
    assert.equal(
      normalizeDatabaseUrl(raw),
      "postgresql://postgres.exampleproj:%26WC%26SecretPass@aws-1-sa-east-1.pooler.supabase.com:6543/postgres"
    );
  });

  it("leaves already-encoded passwords unchanged", () => {
    const encoded =
      "postgresql://user:%26WC%26SecretPass@host.supabase.com:6543/postgres";
    assert.equal(normalizeDatabaseUrl(encoded), encoded);
  });
});
