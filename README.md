# PCA Prep — Google Cloud Professional Cloud Architect exam trainer

An interactive, full-stack web app for preparing for the **Google Cloud Professional
Cloud Architect (PCA)** exam. Content is aligned to the official **exam guide v6.1**
(six domains with published weights, current case studies) and the **Google Cloud
Well-Architected Framework**.

## Features

1. **Diagnostic assessment** — 18 questions across all six domains; scores proficiency per domain.
2. **Tailored study plan** — front-loads your weakest, highest-weight domains into time-bound milestones.
3. **Visual teaching modules** — concise Markdown lessons with Mermaid architecture diagrams (30 modules).
4. **Interactive quizzes** — end-of-module quizzes with immediate, detailed explanations.
5. **Intelligent feedback** — Claude analyzes your mistakes to detect patterns and give targeted tips.
6. **Progress dashboard** — mastery charts and a dynamic "what to focus next".
7. **Full-length simulation** — 55-question, 2-hour exam with split-screen case studies.

## Tech stack

- **Next.js 16** (App Router, Server Actions, `output: standalone`) + **React 19** + **TypeScript**
- **Tailwind CSS v4**, **Recharts**, **Mermaid**, **Lucide**
- **Auth.js (NextAuth v5)** credentials auth, JWT sessions
- **Prisma 7** + **PostgreSQL** (driver adapter `@prisma/adapter-pg`)
- **Claude** feedback via **`@anthropic-ai/vertex-sdk`** (Claude on Vertex AI, GCP ADC) with a direct-API fallback
- Deploy: **Cloud Run + Cloud SQL** (see `deploy/README.md`)

## Local development

Requires Node 24+ and a PostgreSQL database.

```bash
# 1. Start Postgres (option A: Docker)
docker compose up -d db

# 2. Configure env
cp .env.example .env        # then edit AUTH_SECRET (npx auth secret) etc.

# 3. Install + migrate + seed
npm install
npm run db:migrate          # creates tables
npm run db:seed             # demo user: demo@pca.dev / password123

# 4. Validate authored content (optional)
npm run content:validate

# 5. Run
npm run dev                 # http://localhost:3000
```

No Docker? Point `DATABASE_URL` at any Postgres (local install, or a free Neon/Supabase
instance) and run steps 3–5.

## Content

Authored exam content lives as versioned JSON under `content/` (questions, modules,
quizzes, case studies) and is Zod-validated at load time. `npm run content:validate`
checks schemas and all cross-references. The six domains and weights are in
`src/lib/content/domains.ts`.

## Project layout

```
content/                 authored exam content (JSON)
prisma/                  schema, migrations, seed
src/lib/content/         content loader + schema (source of truth)
src/lib/                 scoring, grading, study-plan, progress, recommend, feedback, auth
src/components/          UI kit, QuestionCard, Mermaid, Markdown, charts
src/app/(auth)/          login / register
src/app/(app)/           dashboard, assessment, study-plan, learn, exam
deploy/                  Dockerfile pipeline, Cloud Run + Cloud SQL guide
```
