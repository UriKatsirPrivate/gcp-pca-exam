/**
 * Validates all authored content under /content:
 *  - JSON parses
 *  - matches the Zod schemas
 *  - cross-references resolve (quiz->question, quiz->module, module->quiz)
 *  - answer keys reference real choices
 *  - ids are globally unique
 * Prints per-domain stats. Exits non-zero on any error.
 *
 * Run: npx tsx scripts/validate-content.ts
 */
import fs from "node:fs";
import path from "node:path";
import {
  caseStudySchema,
  moduleSchema,
  questionSchema,
  quizSchema,
  DOMAIN_IDS,
  type Module,
  type Question,
  type Quiz,
} from "../src/lib/content/schema";

const ROOT = path.join(process.cwd(), "content");
const errors: string[] = [];
const warnings: string[] = [];

function readJson(file: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    errors.push(`JSON parse failed: ${file} — ${(e as Error).message}`);
    return undefined;
  }
}
function listJson(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => path.join(dir, f));
}

const allQuestions: Question[] = [];
const assessment: Question[] = [];
const modules: Module[] = [];
const quizzes: Quiz[] = [];
const ids = new Set<string>();
const perDomain: Record<string, { q: number; single: number; multiple: number; d1: number; d2: number; d3: number; cased: number; mods: number; quizzes: number }> = {};

function uid(id: string, where: string) {
  if (ids.has(id)) errors.push(`Duplicate id "${id}" (${where})`);
  ids.add(id);
}

for (const domainId of DOMAIN_IDS) {
  perDomain[domainId] = { q: 0, single: 0, multiple: 0, d1: 0, d2: 0, d3: 0, cased: 0, mods: 0, quizzes: 0 };

  // questions
  const qf = path.join(ROOT, "questions", `${domainId}.json`);
  if (!fs.existsSync(qf)) { errors.push(`Missing questions file for domain ${domainId}`); }
  else {
    const raw = readJson(qf);
    if (Array.isArray(raw)) {
      for (const item of raw) {
        const parsed = questionSchema.safeParse(item);
        if (!parsed.success) { errors.push(`Bad question in ${domainId}.json: ${JSON.stringify(parsed.error.issues[0])}`); continue; }
        const q = parsed.data;
        if (q.domainId !== domainId) errors.push(`Question ${q.id} domainId mismatch (${q.domainId} in ${domainId}.json)`);
        uid(q.id, "question");
        for (const c of q.correct) if (!q.choices.some((ch) => ch.id === c)) errors.push(`Question ${q.id} correct "${c}" not in choices`);
        if (q.type === "single" && q.correct.length !== 1) errors.push(`Question ${q.id} type=single but ${q.correct.length} correct`);
        if (q.type === "multiple" && q.correct.length < 2) warnings.push(`Question ${q.id} type=multiple but <2 correct`);
        allQuestions.push(q);
        const s = perDomain[domainId];
        s.q++; s[q.type === "single" ? "single" : "multiple"]++;
        s[`d${q.difficulty}` as "d1" | "d2" | "d3"]++;
        if (q.caseStudyId) s.cased++;
      }
    } else errors.push(`${domainId}.json is not an array`);
  }

  // modules
  for (const f of listJson(path.join(ROOT, "modules", domainId))) {
    const parsed = moduleSchema.safeParse(readJson(f));
    if (!parsed.success) { errors.push(`Bad module ${f}: ${JSON.stringify(parsed.error.issues[0])}`); continue; }
    const m = parsed.data;
    if (m.domainId !== domainId) errors.push(`Module ${m.id} domainId mismatch`);
    uid(m.id, "module"); modules.push(m); perDomain[domainId].mods++;
  }
  // quizzes
  for (const f of listJson(path.join(ROOT, "quizzes", domainId))) {
    const parsed = quizSchema.safeParse(readJson(f));
    if (!parsed.success) { errors.push(`Bad quiz ${f}: ${JSON.stringify(parsed.error.issues[0])}`); continue; }
    uid(parsed.data.id, "quiz"); quizzes.push(parsed.data); perDomain[domainId].quizzes++;
  }
}

// assessment
const af = path.join(ROOT, "questions", "assessment.json");
if (!fs.existsSync(af)) errors.push("Missing assessment.json");
else {
  const raw = readJson(af);
  if (Array.isArray(raw)) for (const item of raw) {
    const parsed = questionSchema.safeParse(item);
    if (!parsed.success) { errors.push(`Bad assessment question: ${JSON.stringify(parsed.error.issues[0])}`); continue; }
    uid(parsed.data.id, "assessment");
    for (const c of parsed.data.correct) if (!parsed.data.choices.some((ch) => ch.id === c)) errors.push(`Assessment ${parsed.data.id} correct "${c}" not in choices`);
    assessment.push(parsed.data);
  } else errors.push("assessment.json is not an array");
}

// case studies
const caseDir = path.join(ROOT, "case-studies");
const caseIds = new Set<string>();
for (const f of listJson(caseDir)) {
  const parsed = caseStudySchema.safeParse(readJson(f));
  if (!parsed.success) { errors.push(`Bad case study ${f}: ${JSON.stringify(parsed.error.issues[0])}`); continue; }
  caseIds.add(parsed.data.id);
}
for (const want of ["altostrat-media", "cymbal-retail", "ehr-healthcare", "knightmotives-automotive"]) {
  if (!caseIds.has(want)) errors.push(`Missing case study: ${want}`);
}

// cross-references
const qById = new Map([...allQuestions, ...assessment].map((q) => [q.id, q]));
const mById = new Map(modules.map((m) => [m.id, m]));
const quizById = new Map(quizzes.map((q) => [q.id, q]));
for (const m of modules) if (!quizById.has(m.quizId)) errors.push(`Module ${m.id} -> missing quiz ${m.quizId}`);
for (const z of quizzes) {
  if (!mById.has(z.moduleId)) errors.push(`Quiz ${z.id} -> missing module ${z.moduleId}`);
  for (const qid of z.questionIds) if (!qById.has(qid)) errors.push(`Quiz ${z.id} -> missing question ${qid}`);
}
for (const q of [...allQuestions, ...assessment]) if (q.caseStudyId && !caseIds.has(q.caseStudyId)) errors.push(`Question ${q.id} -> missing case study ${q.caseStudyId}`);

// report
console.log("\n=== Content stats ===");
console.log("domain         q  single mult  d1 d2 d3  cased mods quiz");
for (const d of DOMAIN_IDS) {
  const s = perDomain[d];
  console.log(
    `${d.padEnd(14)} ${String(s.q).padStart(2)}   ${String(s.single).padStart(3)}  ${String(s.multiple).padStart(3)}  ${String(s.d1).padStart(2)} ${String(s.d2).padStart(2)} ${String(s.d3).padStart(2)}   ${String(s.cased).padStart(3)}  ${String(s.mods).padStart(3)} ${String(s.quizzes).padStart(3)}`,
  );
}
console.log(`\nTotals: bank=${allQuestions.length}, assessment=${assessment.length}, modules=${modules.length}, quizzes=${quizzes.length}, caseStudies=${caseIds.size}`);

if (warnings.length) { console.log(`\n--- ${warnings.length} warning(s) ---`); for (const w of warnings) console.log("  ⚠ " + w); }
if (errors.length) {
  console.error(`\n✗ ${errors.length} ERROR(S):`);
  for (const e of errors) console.error("  • " + e);
  process.exit(1);
}
console.log("\n✓ All content valid.\n");
