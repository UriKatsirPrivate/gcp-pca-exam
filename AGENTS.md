<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Project conventions

Non-obvious things that will bite you if you don't know them.

## Content
- Authored exam content is **Zod-validated JSON under `content/`** (questions, modules, quizzes, case studies, `videos/modules.json`). The loader (`src/lib/content/`) builds a store **cached on `globalThis`**. After changing content JSON shape or the loader, **restart `next dev`** — HMR keeps serving the stale store and you'll get `undefined`/missing-field errors.
- **Content gates:** `npm run content:validate` (structure) and `npm run content:lint` (psychometrics + provenance) both run in `prebuild` and block the build. Authoring rules, the question schema and the blind-answer-pass procedure are in `docs/content-authoring.md` — read it before writing or editing any question or module.
- **Choices are shuffled at render time** (seeded on attempt/user id + question id, `src/lib/content/shuffle.ts`). Never refer to options by letter in any rationale or prose, and never change what a choice id means on an existing question — `Answer` rows store choice ids.
- Every question carries per-choice `rationale`, `subObjective`, `sourceUrl` and `lastVerified`. `examOnly` is set by `scripts/assign-exam-holdout.ts`, not by hand; held-out items never appear in quizzes, practice or the diagnostic.
- Every module ends with an `## Exam tips` bullet list (the loader throws without it; it feeds `/review`).
- Module YouTube videos must be **verified actually embeddable** — load the embed and play it. oEmbed only proves the video exists; members-only and embedding-disabled videos pass oEmbed but fail in the player.

## Auth & access
- Sign-in is **Google-only** (Auth.js v5, JWT sessions, Prisma adapter).
- Access is a **domain gate**, not an allowlist: a *verified* Google email on `ALLOWED_EMAIL_DOMAINS` (default `google.com`, exact match, `src/lib/email-domain.ts`). Roles: `ADMIN_EMAILS` env (bootstrap admins) ∪ `AllowedUser` rows with `role: "admin"` (the table only grants admin now; removing a row never deletes a user). `ADMIN_EMAILS` grants a role, **not** access — a non-allowed-domain admin email cannot sign in. Single source of truth: `resolveAccess()` in `src/lib/access.ts`.
- Enforcement: `signIn` callback (`src/auth.ts`) blocks logins without `email_verified` or off the allowed domain (the Google `hd` param is only a chooser hint); `requireUser()` re-checks per request; `requireAdmin()` for `/admin`. Auth errors route to `/login` (`pages.error`), not Auth.js's default page.
- The `examUnlocked` override is **keyed by email** (upserts the `User` row) so it works before first sign-in.

## Database
- **Dual connection path, chosen by env** (no code change): Neon via `DATABASE_URL` for dev; Cloud SQL via the connector (`CLOUD_SQL_CONNECTION_NAME`, passwordless IAM) for prod. See `src/lib/prisma.ts`.
- Write migrations as **handcrafted additive SQL** under `prisma/migrations/` — Neon's shadow DB makes `prisma migrate dev` awkward. Apply locally with `npm run db:deploy`.

## Deploy
- Run `./deploy/deploy.sh` (wraps `gcloud builds submit --config deploy/cloudbuild.yaml`: build → push → migrate → deploy). Prod is **`me-west1`**, project `landing-zone-demo-341118` — the `us-central1` default in `cloudbuild.yaml` is wrong for prod. The script uses absolute paths (required for the source and `--config`).
- Before deploying: bump/verify deps with `npm audit` (prod advisories are what matter; `--force` would downgrade `prisma`, don't), run `npm run build`, push. After: real Google sign-in on the prod URL.
- `_ADMIN_EMAILS` must be **space-separated**, not comma-separated (commas collide with gcloud's substitution/`--set-env-vars` delimiters); `resolveAccess` splits on whitespace too.
- `migrate deploy` runs in the pipeline and applies committed migrations. **Never commit `.env`** — prod secrets/bootstrap admins live in Cloud Run env + Secret Manager.
