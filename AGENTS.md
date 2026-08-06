# Code Review Rules — evaluador-innovacion

## General
REJECT if:
- Hardcoded secrets or credentials (API keys, DATABASE_URL, tokens)
- Empty catch blocks (silent error handling)
- `console.log` / debug prints left in production paths (prefer `logServerError`)
- Committing `.env`, `.env.local`, or real secrets

## TypeScript / Next.js
REJECT if:
- Using `any` without a one-line justification comment
- Client components missing `"use client"` when they use hooks/browser APIs
- Fetching `/api/*` without `apiFetch` (shared secret headers)
- Returning raw `String(e)` / stack traces to the client (use `clientErrorMessage`)

PREFER:
- `strict` TypeScript
- Named exports for lib modules
- Domain errors as short Spanish messages; internals logged server-side only

## Security (team tool)
REJECT if:
- New `/api` routes that bypass proxy secret checks when `EVALUADOR_API_SECRET` is set
- Registering arbitrary external URLs as knowledge without Blob path validation
- Disabling auth “temporarily” in production docs without Deployment Protection

## Tests
REJECT if:
- Changing evaluation score parsing, rubric types, or extract heuristics without updating/adding `lib/**/*.test.ts`
- Removing the `npm test` script or CI workflow

## Response Format
FIRST LINE must be exactly:
STATUS: PASSED
or
STATUS: FAILED

If FAILED, list: `file:line - rule violated - issue`
