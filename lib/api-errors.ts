/**
 * Safe client-facing errors: log details server-side, return generic messages.
 */

export function logServerError(scope: string, error: unknown): void {
  const detail = error instanceof Error ? error.stack || error.message : String(error);
  console.error(`[${scope}]`, detail);
}

/** Message safe to return to the client (no internals). */
export function clientErrorMessage(error: unknown, fallback = "Error interno del servidor"): string {
  if (!(error instanceof Error)) return fallback;
  const msg = error.message.trim();
  // Allow short, intentional domain errors without leaking stacks / SQL / paths
  if (
    msg &&
    msg.length <= 200 &&
    !/password|ECONN|postgres|supabase|token|secret|stack|at\s+\S+\s+\(/i.test(msg)
  ) {
    return msg;
  }
  return fallback;
}
