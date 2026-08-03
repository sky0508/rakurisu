# This is NOT the Next.js you know

This version (16.2.7) has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

- Auth guard lives in `src/proxy.ts` (NOT `middleware.ts`). Authed layout is pass-through + `export const dynamic = 'force-dynamic'` — do not put `requireAuth` in a layout (redirect loop).
- DB access is Drizzle over Neon Postgres (`src/lib/db.ts` singleton, `max:1`). Schema in `drizzle/schema.ts`, pushed via `pnpm db:push`.
- The lead-harvest pipeline runs in a separate Python worker (`../worker/`), not in Next. Web only enqueues runs and reads progress from the DB.
