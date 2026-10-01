# PCA Prep — Google Cloud Professional Cloud Architect exam trainer

An interactive, full-stack web app for preparing for the **Google Cloud Professional
Cloud Architect (PCA)** exam. Content is aligned to the official **exam guide v6.1**
(six domains with published weights, current case studies) and the **Google Cloud
Well-Architected Framework**.

## Features

### Learning
1. **Diagnostic assessment** — a **blueprint-weighted 30-question set** across all six domains, **freshly resampled on each retake**; scores each domain (a proficiency band appears only once a domain has 8+ answered items; below that you see a tally)  and lets you **review every question afterward** (your answer vs. the correct one, with the explanation; filter to incorrect-only).
2. **Tailored study plan** — front-loads your weakest, highest-weight domains into time-bound milestones.
3. **Visual teaching modules** — in-depth Markdown lessons (~1,500–2,200 words, each ending in an **Exam tips** list) with Mermaid architecture diagrams and inline links to official docs (30 modules), each with a **curated, embeddable YouTube video**. Estimated time is computed from the actual content.
4. **Interactive quizzes** — end-of-module quizzes with immediate **per-option rationales** (why each choice is right or wrong; options are shuffled per attempt) and **"Learn more" links to the official GCP docs** for the concepts each question covers; **mark any module complete** manually.
5. **Practice drills** (`/practice`) — unlimited, targeted practice that pulls from your **weakest concepts and recently-missed questions** (or pick any single domain), with instant explanations and doc links.
6. **Intelligent feedback** — Claude analyzes your mistakes to detect patterns and give targeted tips (cached per learner; refresh on demand).
7. **Progress dashboard** — mastery charts, a dynamic "what to focus next", and a **reset-progress** control.
8. **Full-length simulation** — 55-question, 2-hour exam with split-screen case studies. **Autosaves as you go** so a reload or crash mid-exam restores your answers, flags, and timer; draws from a **held-out exam-only pool** that quizzes and practice never show, **prefers questions you haven't seen** across retakes and mixes difficulty; **full per-question review** after submitting (incorrect-only filter). Unlocks by earning it (80% of modules or 70% mastery) **or by an admin override**.
9. **Final Review** (`/review`) — every domain's key takeaways and per-module exam tips on one page for the day before the exam.
10. **Accessibility** — keyboard-navigable runners and screen-reader timer announcements at the 30/15/5/1-minute marks.
11. **Dark / light theme** — system-aware toggle, no flash on load.

### Access & administration
12. **Google sign-in, `@google.com` only** — Google-only OAuth; any *verified* Google account on the allowed email domain (default `google.com`, override with `ALLOWED_EMAIL_DOMAINS`) can use the service, with no allowlist to maintain. Everyone else sees the public landing page but is shown a "only @google.com accounts" message on sign-in. Responses carry baseline **security headers** (frame-deny, nosniff, HSTS, a report-only CSP).
13. **Roles** — every user is `user` (default) or `admin` (via `ADMIN_EMAILS` or an admin grant in the console).
14. **Admin console** (`/admin`, admins only) — grant/revoke the admin role and **force-unlock the final exam** for any allowed-domain account (even before their first sign-in).
15. **Admin analytics** — cumulative usage, module completion, quiz/exam performance, plus a **hardest-questions QA view** that flags likely mis-keyed questions by correct-rate.

## Tech stack

- **Next.js 16** (App Router, Server Actions, `output: standalone`) + **React 19** + **TypeScript**
- **Tailwind CSS v4**, **Recharts**, **Mermaid**, **Lucide**
- **Auth.js (NextAuth v5)** — Google OAuth, JWT sessions, an **email-domain gate** (`@google.com`) with `user`/`admin` roles
- **Prisma 7** + **PostgreSQL** (driver adapter `@prisma/adapter-pg`)
- **Claude** feedback via **`@anthropic-ai/vertex-sdk`** (Claude on Vertex AI, GCP ADC) with a direct-API fallback
- Deploy: **Cloud Run + Cloud SQL** (see `deploy/README.md`)

## Local development

Requires Node 24+ and a PostgreSQL database.

```bash
# 1. Start Postgres (option A: Docker)
docker compose up -d db

# 2. Configure env
cp .env.example .env        # then set:
                            #   AUTH_SECRET            (npx auth secret)
                            #   AUTH_GOOGLE_ID/SECRET  (Google OAuth web client)
                            #   ADMIN_EMAILS           (your email — bootstrap admin)

# 3. Install + migrate
npm install
npm run db:migrate          # creates tables

# 4. Validate authored content (optional)
npm run content:validate

# 5. Run
npm run dev                 # http://localhost:3000
```

Sign-in is **Google-only**. To log in locally, set `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET`
from a Google OAuth web client (redirect URI `http://localhost:3000/api/auth/callback/google`)
and sign in with an `@google.com` account (set `ALLOWED_EMAIL_DOMAINS` to use another
domain locally). Put your email in `ADMIN_EMAILS` to be an admin; grant more admins from
the `/admin` console.

No Docker? Point `DATABASE_URL` at any Postgres (local install, or a free Neon/Supabase
instance) and run steps 3–5.

## Content

Authored exam content lives as versioned JSON under `content/` (questions, modules,
quizzes, case studies) and is Zod-validated at load time. `npm run content:validate`
checks schemas, all cross-references, choice/answer-key id uniqueness, quiz↔module
domain agreement, a per-domain question floor, module depth (≥1,200 words and an
`## Exam tips` list), takeaways per domain, and that the curated concept→docs and
concept→tip maps reference concepts that actually exist. `npm run content:lint` checks
that the bank *measures* rather than leaks (per-choice rationales, option-length and
key-length cues, reflex answers, near-duplicate stems, provenance on every question,
holdout leakage). Both run in `prebuild`. The bank is 400 domain questions plus an
18-question diagnostic pool; every question carries a `sourceUrl` and `lastVerified`.
Authoring rules and the blind-answer-pass procedure are in
[`docs/content-authoring.md`](docs/content-authoring.md). The six domains and weights
are in `src/lib/content/domains.ts`; concept→docs links are in `src/lib/concept-docs.ts`.

## Project layout

```
content/                 authored exam content (JSON; incl. takeaways/, videos/modules.json)
scripts/                 content validate/lint, exam-holdout assignment, blind-pass tooling
prisma/                  schema, migrations, seed
src/lib/content/         content loader + schema (source of truth)
src/lib/                 scoring, grading, study-plan, progress, recommend, feedback,
                         session, access (email-domain gate + roles), admin-stats, concept-docs
src/components/          UI kit, QuestionCard, AnswerReview, Mermaid, Markdown, charts, ThemeToggle
src/app/(auth)/          login
src/app/(app)/           dashboard, assessment, study-plan, learn, practice, exam, review
src/app/(admin)/admin/   admin console (admin grants, exam unlock) + analytics
deploy/                  Dockerfile pipeline, Cloud Run + Cloud SQL guide
```
