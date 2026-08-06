/**
 * Browser fetch wrapper that attaches the shared API secret when configured.
 * Set NEXT_PUBLIC_EVALUADOR_API_SECRET to the same value as EVALUADOR_API_SECRET.
 */

import { API_SECRET_HEADER } from "@/lib/api-auth-constants";

export function getBrowserApiSecret(): string | undefined {
  const s = process.env.NEXT_PUBLIC_EVALUADOR_API_SECRET?.trim();
  return s || undefined;
}

export function withApiAuthHeaders(init?: HeadersInit): Headers {
  const headers = new Headers(init);
  const secret = getBrowserApiSecret();
  if (secret) {
    if (!headers.has(API_SECRET_HEADER)) {
      headers.set(API_SECRET_HEADER, secret);
    }
    if (!headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${secret}`);
    }
  }
  return headers;
}

export function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return fetch(input, {
    ...init,
    headers: withApiAuthHeaders(init?.headers),
  });
}
