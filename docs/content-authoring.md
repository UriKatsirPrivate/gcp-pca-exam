# Content authoring guide

How exam questions, modules and takeaways are written, validated and shipped. Every rule exists because skipping it produced a defect in the sibling `claude-certified-architect-professional-prep` project (whose `BUILDING-A-PREP-APP.md` is the origin of this guide).

## Gates

| Command | What it proves |
|---|---|
| `npm run content:validate` | Content parses, matches Zod, cross-references resolve, keys exist, modules have ≥1200 words and an `## Exam tips` list, every domain has a takeaways file. |
| `npm run content:lint` | The bank *measures* rather than leaks: per-choice rationale, option-length geometry, key-length cues, reflex answers, provenance, near-duplicate stems, holdout leakage. |
| `npx tsx scripts/lint-content.ts --file <path>` | Same, for one file (use while authoring; cross-bank checks are skipped). |

`prebuild` runs both and blocks the build. Neither can tell you an answer is *right* — that needs the blind answer pass (below) and a human read.

## Question schema (`content/questions/<domainId>.json`)

```jsonc
{
  "id": "q-security-023",            // q-<domainId>-NNN, never reused or renumbered
  "type": "single",                  // "single" | "multiple" (select N — say N in the stem)
  "domainId": "security",
  "concepts": ["cmek", "kms"],       // lowercase-kebab; REUSE existing slugs (grep the bank first)
  "caseStudyId": "ehr-healthcare",   // optional; only if the stem depends on that case study
  "subObjective": "security.1",      // "<domainId>.<n>" into src/lib/content/domains.ts (1-based)
  "sourceUrl": "https://cloud.google.com/kms/docs/cmek",  // the specific doc page the key was verified against
  "lastVerified": "2026-10-01",      // date you fetched it
  "examOnly": false,                 // set by scripts/assign-exam-holdout.ts, not by hand
  "prompt": "…",
  "exhibit": { "label": "…", "format": "log|config|code|table|metrics", "content": "…", "language": "yaml" }, // optional
  "choices": [ { "id": "a", "text": "…", "rationale": "…" } ],
  "correct": ["b"],
  "explanation": "…",                // optional overall takeaway; per-option reasoning goes in rationale
  "difficulty": 2                    // 1 | 2 | 3
}
```

### Hard rules (the lint fails on these)

- **Every choice has a `rationale`**: why it is keyed, or the specific misconception that makes it wrong. Never refer to options by letter — `(a)`, "option B", "the first choice" — choices are **shuffled at render time** (`src/lib/content/shuffle.ts`), so letters in prose are wrong for every candidate.
- **Option lengths within one item differ by ≤ 1.4× (longest ÷ shortest).** The key must not be systematically the longest: across a file it is the longest option in ≤ 35% of items (and not far below chance either — "never pick the longest" is also a cue). Mean key length ÷ mean distractor length ≤ 1.10.
- **No reflex answers**: no single key archetype ("use the managed service") above ~5% of all keys.
- **Provenance on every item**: resolvable `subObjective` in the item's own domain, a `sourceUrl`, a `lastVerified` date.
- **Near-duplicate stems fail** (Jaccard ≥ 0.6 on content words).
- **d1 share** 20–25% per domain (warn); a domain with zero d1 items fails.
- Held-out (`examOnly`) items must not appear in any quiz.

### Judgment rules (no tool can check these)

- **Original scenarios.** Invent the company, the numbers, the constraints. Never reproduce or lightly reskin real exam questions or braindump sites. Case-study questions may use the facts in `content/case-studies/*.json`.
- **Every factual claim is verified against current Google Cloud docs** by actually fetching the page. Do not trust training data, the module text, or the existing explanation — products get renamed and limits change.
- **Each distractor encodes a real practitioner misconception** (a plausible-but-wrong service, a limit that was true two years ago, a correct action in the wrong order). If three options can be eliminated on sight, the item is 2-option in fact.
- **Kill never-correct tells.** If a family of options ("add more replicas", "use a bigger machine type") is never the key anywhere in the bank, candidates drop it unread. Make each correct at least once where it genuinely is.
- **`difficulty` means something.** d1 = one concept, one step, still not guessable. d2 = a realistic scenario needing a trade-off. d3 = conflicting constraints, multi-step inference, or diagnosis from an exhibit.
- **Exhibits supply numbers; options are judgments.** No bare-number answers (computed totals, $/month) — they test arithmetic, not architecture, and arithmetic inside exhibits was the most error-prone thing authored in the sibling project.
- **Multi-select stems state the count** ("Choose two.").
- **Pre-balance while writing**: draft each item's options at similar lengths with the key not the longest. Agents told to "write, then run the lint and fix" iterated blind; agents that pre-balanced passed first time.
- Single-answer items keyed at any position are fine — position is masked by the render-time shuffle. (The lint only *warns* on authored position skew.)

### Choice-id stability

`Answer` rows in the database store choice ids. When revising an existing question, **never change what a choice id means**: you may reword a choice to fix length or accuracy, but `a` must stay "the same option". Never renumber question ids.

## Modules (`content/modules/<domainId>/mod-<domain>-NN.json`)

- Keep `id`, `domainId`, `title`, `order`, `quizId`. Rewrite `bodyMarkdown` to **1,500–2,200 words**: `##` sections, comparison tables, concrete limits and defaults, an anti-patterns section, and **end with a `## Exam tips` section — a bullet list** (the loader throws on a module without one; it feeds `/review`).
- 1–2 Mermaid diagrams in `diagrams[]` (not inline in the body); they must render.
- Link authoritative docs inline (`https://cloud.google.com/...`) where a claim could drift; fetch each page first.
- `estMinutes` is recomputed at load from word count — put any plausible integer.

## Takeaways (`content/takeaways/<domainId>.json`)

`{ "domainId", "takeaways": [{ "title", "body" }], "sources": ["…"] }` — 4–6 dense recap cards per domain, each a decision rule rather than a definition. `sources` are the doc pages used.

## Holdout

`npx tsx scripts/assign-exam-holdout.ts [--target 140] [--dry]` marks a blueprint-weighted slice `examOnly` (never an item a quiz references). The exam generator draws unseen holdout items first, so a candidate's first simulation is mostly novel. Re-run after the bank or quizzes change.

## Blind answer pass (do after every bulk authoring round)

1. Write key-stripped copies of the bank (no `correct`, `explanation`, `rationale`; keep a count for multi-select) **outside** `content/`.
2. Have several fresh agents answer them cold, forbidden from reading the real files. Require chosen ids, a confidence, and flags: `ambiguous`, `no-correct-answer`, `arithmetic-error`, `exhibit-mismatch`, `stem-underspecified`, `factually-wrong`.
3. Diff against keys. A confident miss means the item is probably wrong; a low-confidence hit means it is harder than its tag.

## Agent scoping

- One agent per domain file (or per staging file) so writes never collide. New questions are written to `content/questions/_staging/<domain>-<batch>.json` and merged afterwards; the loader and lint ignore that directory.
- Read-only audit agents must be agent types with no Edit/Write tools.
- Save every few items rather than buffering a whole file in one write.
- Re-run validate and lint yourself before merging; do not trust an agent's self-report.

## Videos

Module videos must be verified embeddable — load the embed and play it. oEmbed only proves the video exists.
