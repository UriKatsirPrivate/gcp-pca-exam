# PCA Prep — Google Cloud Professional Cloud Architect exam trainer

An interactive, full-stack web app for preparing for the **Google Cloud Professional
Cloud Architect (PCA)** exam. Content is aligned to the official **exam guide v6.1**
(six domains with published weights, current case studies) and the **Google Cloud
Well-Architected Framework**.

## Features

### Learning
1. **Diagnostic assessment** — a domain-balanced set across all six domains, **freshly resampled on each retake**; scores proficiency per domain and lets you **review every question afterward** (your answer vs. the correct one, with the explanation; filter to incorrect-only).
2. **Tailored study plan** — front-loads your weakest, highest-weight domains into time-bound milestones.
3. **Visual teaching modules** — concise Markdown lessons with Mermaid architecture diagrams (30 modules), each with a **curated, embeddable YouTube video**. Estimated time is computed from the actual content.
4. **Interactive quizzes** — end-of-module quizzes with immediate, detailed explanations and **"Learn more" links to the official GCP docs** for the concepts each question covers; **mark any module complete** manually.
5. **Practice drills** (`/practice`) — unlimited, targeted practice that pulls from your **weakest concepts and recently-missed questions** (or pick any single domain), with instant explanations and doc links.
6. **Intelligent feedback** — Claude analyzes your mistakes to detect patterns and give targeted tips (cached per learner; refresh on demand).
7. **Progress dashboard** — mastery charts, a dynamic "what to focus next", and a **reset-progress** control.
8. **Full-length simulation** — 55-question, 2-hour exam with split-screen case studies. **Autosaves as you go** so a reload or crash mid-exam restores your answers, flags, and timer; **prefers questions you haven't seen** before across retakes and mixes difficulty; **full per-question review** after submitting (incorrect-only filter). Unlocks by earning it (80% of modules or 70% mastery) **or by an admin override**.
9. **Accessibility** — keyboard-navigable runners and screen-reader timer announcements at the 30/15/5/1-minute marks.
10. **Dark / light theme** — system-aware toggle, no flash on load.

### Access & administration
11. **Google sign-in + allowlist** — Google-only OAuth; only **allowlisted emails** (plus bootstrap `ADMIN_EMAILS`) can use the service. Everyone else sees the public landing page but is shown a "not authorized" message on sign-in. Responses carry baseline **security headers** (frame-deny, nosniff, HSTS, a report-only CSP).
12. **Roles** — every user is `user` (default) or `admin`.
13. **Admin console** (`/admin`, admins only) — add/remove allowed users, set their role, and **force-unlock the final exam** for any allowed account (even before their first sign-in).
14. **Admin analytics** — cumulative usage, module completion, quiz/exam performance, plus a **hardest-questions QA view** that flags likely mis-keyed questions by correct-rate.

## Tech stack

- **Next.js 16** (App Router, Server Actions, `output: standalone`) + **React 19** + **TypeScript**
- **Tailwind CSS v4**, **Recharts**, **Mermaid**, **Lucide**
- **Auth.js (NextAuth v5)** — Google OAuth, JWT sessions, an email **allowlist with `user`/`admin` roles**
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
and put your Google email in `ADMIN_EMAILS` so you're allowed (and an admin). Add more
users from the `/admin` console.

No Docker? Point `DATABASE_URL` at any Postgres (local install, or a free Neon/Supabase
instance) and run steps 3–5.

## Content

Authored exam content lives as versioned JSON under `content/` (questions, modules,
quizzes, case studies) and is Zod-validated at load time. `npm run content:validate`
checks schemas, all cross-references, choice/answer-key id uniqueness, quiz↔module
domain agreement, a per-domain question floor, and that the curated concept→docs and
concept→tip maps reference concepts that actually exist. The six domains and weights
are in `src/lib/content/domains.ts`; concept→docs links are in `src/lib/concept-docs.ts`.

## Project layout

```
content/                 authored exam content (JSON; incl. videos/modules.json)
prisma/                  schema, migrations, seed
src/lib/content/         content loader + schema (source of truth)
src/lib/                 scoring, grading, study-plan, progress, recommend, feedback,
                         session, access (allowlist + roles), admin-stats, concept-docs
src/components/          UI kit, QuestionCard, AnswerReview, Mermaid, Markdown, charts, ThemeToggle
src/app/(auth)/          login
src/app/(app)/           dashboard, assessment, study-plan, learn, practice, exam
src/app/(admin)/admin/   admin console (allowlist, roles, exam unlock) + analytics
deploy/                  Dockerfile pipeline, Cloud Run + Cloud SQL guide
```
