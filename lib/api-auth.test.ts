import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import { API_SECRET_HEADER } from "@/lib/api-auth-constants";
import {
  extractRequestSecret,
  requireApiSecretStrict,
  secretsEqual,
} from "@/lib/api-auth";
import { clientErrorMessage } from "@/lib/api-errors";

describe("api-auth", () => {
  const prev = process.env.EVALUADOR_API_SECRET;
  const prevPub = process.env.NEXT_PUBLIC_EVALUADOR_API_SECRET;

  beforeEach(() => {
    delete process.env.EVALUADOR_API_SECRET;
    delete process.env.NEXT_PUBLIC_EVALUADOR_API_SECRET;
  });

  afterEach(() => {
    if (prev === undefined) delete process.env.EVALUADOR_API_SECRET;
    else process.env.EVALUADOR_API_SECRET = prev;
    if (prevPub === undefined) delete process.env.NEXT_PUBLIC_EVALUADOR_API_SECRET;
    else process.env.NEXT_PUBLIC_EVALUADOR_API_SECRET = prevPub;
  });

  it("allows all requests when secret unset", () => {
    const req = new Request("http://localhost/api/evaluate", { method: "POST" });
    const r = requireApiSecretStrict(req);
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.enforced, false);
  });

  it("rejects missing secret when configured", () => {
    process.env.EVALUADOR_API_SECRET = "test-secret-123";
    const req = new Request("http://localhost/api/evaluate", { method: "POST" });
    const r = requireApiSecretStrict(req);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.status, 401);
  });

  it("accepts Bearer token", () => {
    process.env.EVALUADOR_API_SECRET = "test-secret-123";
    const req = new Request("http://localhost/api/chat", {
      headers: { Authorization: "Bearer test-secret-123" },
    });
    const r = requireApiSecretStrict(req);
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.enforced, true);
  });

  it("accepts X-Evaluador-Secret header", () => {
    process.env.EVALUADOR_API_SECRET = "test-secret-123";
    const req = new Request("http://localhost/api/chat", {
      headers: { [API_SECRET_HEADER]: "test-secret-123" },
    });
    assert.equal(extractRequestSecret(req), "test-secret-123");
    const r = requireApiSecretStrict(req);
    assert.equal(r.ok, true);
  });

  it("secretsEqual is length-sensitive", () => {
    assert.equal(secretsEqual("abc", "abc"), true);
    assert.equal(secretsEqual("abc", "abd"), false);
    assert.equal(secretsEqual("abc", "abcd"), false);
  });
});

describe("api-errors", () => {
  it("passes short domain messages", () => {
    assert.equal(clientErrorMessage(new Error("Blob storage no configurado")), "Blob storage no configurado");
  });

  it("hides connection / credential details", () => {
    assert.equal(
      clientErrorMessage(new Error("password authentication failed for user postgres")),
      "Error interno del servidor"
    );
  });
});
