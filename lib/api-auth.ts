import { API_SECRET_HEADER } from "@/lib/api-auth-constants";

export { API_SECRET_HEADER };

/**
 * Shared API secret for protecting /api/* (internal team tool).
 * When unset, requests are allowed (local open-dev).
 * When set, require Authorization: Bearer <secret> or X-Evaluador-Secret.
 * Server may use EVALUADOR_API_SECRET; browser uses NEXT_PUBLIC_EVALUADOR_API_SECRET (same value).
 */

export function getApiSecret(): string | undefined {
  const s =
    process.env.EVALUADOR_API_SECRET?.trim() ||
    process.env.NEXT_PUBLIC_EVALUADOR_API_SECRET?.trim();
  return s || undefined;
}

export function isApiSecretConfigured(): boolean {
  return !!getApiSecret();
}

/** Extract secret from Authorization Bearer or X-Evaluador-Secret. */
export function extractRequestSecret(request: Request): string | undefined {
  const headerSecret = request.headers.get(API_SECRET_HEADER)?.trim();
  if (headerSecret) return headerSecret;

  const auth = request.headers.get("authorization");
  if (!auth) return undefined;
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() || undefined;
}

export type ApiAuthResult =
  | { ok: true; enforced: boolean }
  | { ok: false; status: 401; error: string };

/**
 * Validate API secret. If secret env is empty → ok (dev open mode).
 * If configured → require matching header.
 */
export function requireApiSecret(request: Request): ApiAuthResult {
  const expected = getApiSecret();
  if (!expected) {
    return { ok: true, enforced: false };
  }
  const provided = extractRequestSecret(request);
  if (!provided || provided !== expected) {
    return {
      ok: false,
      status: 401,
      error: "No autorizado. Envía Authorization: Bearer <EVALUADOR_API_SECRET> o X-Evaluador-Secret.",
    };
  }
  return { ok: true, enforced: true };
}

/** Timing-safe-ish compare for secrets of equal length (best-effort in JS). */
export function secretsEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) {
    out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return out === 0;
}

/** Prefer secretsEqual when both sides known; used by requireApiSecret via !== for simplicity + tests. */
export function requireApiSecretStrict(request: Request): ApiAuthResult {
  const expected = getApiSecret();
  if (!expected) {
    return { ok: true, enforced: false };
  }
  const provided = extractRequestSecret(request);
  if (!provided || !secretsEqual(provided, expected)) {
    return {
      ok: false,
      status: 401,
      error: "No autorizado. Envía Authorization: Bearer <EVALUADOR_API_SECRET> o X-Evaluador-Secret.",
    };
  }
  return { ok: true, enforced: true };
}
