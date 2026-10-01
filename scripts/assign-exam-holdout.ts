/**
 * Reserve an exam-only item pool.
 *
 * The simulation exam draws from the same bank that feeds module quizzes and
 * practice drills, so most items on a candidate's *first* exam would be
 * questions they had already answered while studying. This marks a
 * blueprint-weighted slice of the bank `examOnly`, which the loader holds out of
 * quizzes, drills and the diagnostic (`getQuestionsByDomain`,
 * `getQuestionsByConcept`, `sampleAssessment`) while `generateExam` prefers it.
 *
 * Only items no module quiz references are eligible — a quiz's authored item
 * list is part of the lesson and is never taken away.
 *
 * Run: npx tsx scripts/assign-exam-holdout.ts [--target 80] [--dry]
 */
import fs from "node:fs";
import path from "node:path";
import { DOMAINS } from "../src/lib/content/domains";
import type { DomainId } from "../src/lib/content/schema";

const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const TARGET = args.includes("--target") ? Number(args[args.indexOf("--target") + 1]) : 140;

const ROOT = path.join(process.cwd(), "content");
const QDIR = path.join(ROOT, "questions");

interface Item {
  id: string;
  domainId: string;
  difficulty: number;
  examOnly?: boolean;
  [k: string]: unknown;
}

// Ids a module quiz teaches with — never held out.
const referenced = new Set<string>();
const quizRoot = path.join(ROOT, "quizzes");
for (const d of fs.readdirSync(quizRoot)) {
  const sub = path.join(quizRoot, d);
  if (!fs.statSync(sub).isDirectory()) continue;
  for (const f of fs.readdirSync(sub).filter((x) => x.endsWith(".json"))) {
    const quiz = JSON.parse(fs.readFileSync(path.join(sub, f), "utf8")) as {
      questionIds: string[];
    };
    for (const id of quiz.questionIds) referenced.add(id);
  }
}

const files = new Map<string, Item[]>();
for (const f of fs.readdirSync(QDIR).filter((x) => x.endsWith(".json") && x !== "assessment.json")) {
  files.set(f, JSON.parse(fs.readFileSync(path.join(QDIR, f), "utf8")) as Item[]);
}

// Weighted holdout size per domain, so every domain can fill its 55-item form
// quota out of the holdout alone on a first attempt.
const totalWeight = DOMAINS.reduce((n, d) => n + d.weightPct, 0);
const want = new Map(
  DOMAINS.map((d) => [d.id, Math.max(4, Math.round((d.weightPct / totalWeight) * TARGET))]),
);

let held = 0;
const summary: string[] = [];

for (const [file, items] of files) {
  const domainId = path.basename(file, ".json") as DomainId;
  const quota = want.get(domainId) ?? 0;

  // Spread the holdout across difficulty so a form built from it is not all easy.
  const eligible = items.filter((q) => !referenced.has(q.id));
  const byDifficulty = new Map<number, Item[]>();
  for (const q of eligible) {
    const b = byDifficulty.get(q.difficulty) ?? [];
    b.push(q);
    byDifficulty.set(q.difficulty, b);
  }
  const picked: Item[] = [];
  let progressed = true;
  while (picked.length < quota && progressed) {
    progressed = false;
    for (const d of [3, 2, 1]) {
      const b = byDifficulty.get(d);
      if (b?.length && picked.length < quota) {
        picked.push(b.shift()!);
        progressed = true;
      }
    }
  }

  const pickedIds = new Set(picked.map((q) => q.id));
  for (const q of items) {
    if (pickedIds.has(q.id)) q.examOnly = true;
    else delete q.examOnly;
  }
  held += picked.length;
  summary.push(
    `${domainId.padEnd(18)} bank=${String(items.length).padStart(3)} quiz-linked=${String(
      items.length - eligible.length,
    ).padStart(3)} eligible=${String(eligible.length).padStart(3)} held=${String(picked.length).padStart(3)} (want ${quota})`,
  );

  if (!DRY) {
    fs.writeFileSync(path.join(QDIR, file), JSON.stringify(items, null, 2) + "\n");
  }
}

console.log(summary.join("\n"));
console.log(`\n${DRY ? "[dry] " : ""}exam-only holdout: ${held} items (target ${TARGET}).`);
if (held < 55) {
  console.log(
    `⚠ Holdout is smaller than one full form (55). Candidates will see repeats on a first simulation.`,
  );
}
