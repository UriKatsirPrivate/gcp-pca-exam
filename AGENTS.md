<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Project conventions

Non-obvious things that will bite you if you don't know them.

## Content
- Authored exam content is **Zod-validated JSON under `content/`** (questions, modules, quizzes, case studies, `videos/modules.json`). The loader (`src/lib/content/`) builds a store **cached on `globalThis`**. After changing content JSON shape or the loader, **restart `next dev`** — HMR keeps serving the stale store and you'll get `undefined`/missing-field errors.
- Module YouTube videos must be **verified actually embeddable** — load the embed and play it. oEmbed only proves the video exists; members-only and embedding-disabled videos pass oEmbed but fail in the player.

## Auth & access
- Sign-in is **Google-only** (Auth.js v5, JWT sessions, Prisma adapter).
- Access is an **allowlist**: `ADMIN_EMAILS` env (bootstrap admins, always allowed + admin) ∪ the `AllowedUser` table. Single source of truth: `resolveAccess()` in `src/lib/access.ts`.
- Enforcement: `signIn` callback (`src/auth.ts`) blocks disallowed logins; `requireUser()` re-checks per request; `requireAdmin()` for `/admin`. Auth errors route to `/login` (`pages.error`), not Auth.js's default page.
- The `examUnlocked` override is **keyed by email** (upserts the `User` row) so it works before first sign-in.

## Database
- **Dual connection path, chosen by env** (no code change): Neon via `DATABASE_URL` for dev; Cloud SQL via the connector (`CLOUD_SQL_CONNECTION_NAME`, passwordless IAM) for prod. See `src/lib/prisma.ts`.
- Write migrations as **handcrafted additive SQL** under `prisma/migrations/` — Neon's shadow DB makes `prisma migrate dev` awkward. Apply locally with `npm run db:deploy`.

## Deploy
- `gcloud builds submit --config deploy/cloudbuild.yaml` (build → push → migrate → deploy). **Use absolute paths** for the source and `--config`.
- `_ADMIN_EMAILS` must be **space-separated**, not comma-separated (commas collide with gcloud's substitution/`--set-env-vars` delimiters); `resolveAccess` splits on whitespace too.
- `migrate deploy` runs in the pipeline and applies committed migrations. **Never commit `.env`** — prod secrets/bootstrap admins live in Cloud Run env + Secret Manager.
