**Subject:** Capstone submission — Builder path: "PCA Prep," a Claude-powered exam trainer on Google Cloud

Hi Champions team,

Submitting my capstone under the **Builder** path. I built and deployed **PCA Prep**, a full-stack web app that helps engineers prepare for the Google Cloud Professional Cloud Architect exam, with Claude generating personalized coaching from each learner's answer history.

**The pain point.** PCA prep is mostly static question banks that tell you *what* you got wrong but not *why you keep getting it wrong*. PCA Prep closes that loop: it detects recurring weak-concept patterns across a learner's attempts and has Claude turn them into targeted, encouraging coaching tips mapped to real GCP best practices.

**≥1 GCP service — Compute layer (plus Data + Vertex).**

- **Cloud Run** runs the Next.js app (standalone output), build→migrate→deploy via Cloud Build.
- **Cloud SQL** is the per-user datastore, reached through the Cloud SQL connector with **passwordless IAM auth** (no DB password in the runtime).
- Claude itself runs on **Vertex AI** via `@anthropic-ai/vertex-sdk` using GCP Application Default Credentials — no API key to manage.

**≥2 Claude / agentic patterns.**

1. **Context engineering.** Rather than dumping raw history at the model, the app engineers a compact, structured context: it pulls the learner's recent answers, computes per-domain accuracy, and ranks their most-missed concepts, then feeds only that distilled signal into the prompt. Claude reasons over an accurate, current picture of the learner instead of guessing.

2. **Token efficiency.** The Claude call is treated as a real cost to defend against. Feedback is cached keyed by the learner's latest-answer timestamp — if nothing new has been answered, the expensive call is skipped entirely. A manual "refresh" is rate-limited to once per 60s, input is capped at the 200 most recent answers, and output is bounded to 700 tokens. The SDK is lazily imported so it never loads on cold paths that don't need it.

Two supporting patterns also show up: **prompt design** (a dedicated PCA-coach system prompt plus a structured user prompt, with defensive parsing that accepts either JSON or line-delimited output) and **dynamic workflows** (deterministic rule-based insights always run; the LLM layer enriches them best-effort behind a Vertex → direct-Anthropic → rules-only fallback chain, so the feature degrades gracefully and never blocks the response).

**Judgement in my area of expertise.** I used Claude as a research and build partner, but the architecture decisions — IAM-only DB auth, the caching/rate-limit strategy to keep Vertex spend predictable, and keeping a deterministic rule layer underneath the LLM so the product works even with the model disabled — are mine, drawn from backend/GCP experience.

Repo and a short walkthrough available on request.

Best,
Uri Katsir
