# Database schema migrations

Runtime schema bootstrap lives in [`lib/db-migrations.ts`](../lib/db-migrations.ts)
(`runPostgresMigrations`), invoked from `ensureDb()` in `lib/db-postgres.ts`.

There is no separate SQL migration runner yet; changes are additive
`CREATE TABLE IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` statements plus
legacy JSONB backfills. Prefer extending `runPostgresMigrations` for schema
changes so query helpers stay separate from DDL.
