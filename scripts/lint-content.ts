/**
 * Psychometric lint for the authored question bank.
 *
 * `validate-content.ts` proves the content *parses*. This proves it *measures*:
 * it fails the build on the surface cues that let a test-wise candidate answer
 * without knowing anything — a key that is reliably the longest option, keys
 * clustered on (a)/(b), select-N items that always key the first two options —
 * plus the authoring debts that block choice shuffling.
 *
 * Run:  npx tsx scripts/lint-content.ts [--file content/questions/x.json] [--warn-only]
 */
import fs from "node:fs";
import path from "node:path";
import { questionSchema, type Question } from "../src/lib/content/schema";
import { resolveSubObjective } from "../src/lib/content/domains";

// --- thresholds -------------------------------------------------------------
const MAX_KEY_IS_LONGEST_RATE = 0.35; // share of items where the key is the longest option
// …and a floor. Driving key-is-longest to zero passes an upper bound while
// building the mirror-image cue: a candidate then learns "never pick the
// longest." The rate has to sit near chance, not below it.
const MIN_KEY_IS_LONGEST_FRACTION_OF_CHANCE = 0.5;
const MAX_KEY_LENGTH_RATIO = 1.1; // mean(key chars) / mean(distractor chars)
const MAX_OPTION_LENGTH_RATIO = 1.4; // longest/shortest option within one item
// Choices are shuffled at render time, so authored key position is not a cue the
// candidate can see. Position skew is reported but only warned on.
const POSITION_SKEW = 1.6; // observed/expected keys at any one position
const MIN_POSITION_EXPECTED = 5; // don't judge position on tiny files
const MAX_FIRST_TWO_MULTIPLIER = 2.0; // select-N items keying the first two options, vs chance
const MAX_PROMPT_SIMILARITY = 0.6; // Jaccard over content words of two stems
const MIN_STEM_TOKENS = 8; // stems with fewer content words are too generic to compare
const MAX_REFLEX_SHARE = 0.05; // share of keys allowed to be the same reflex answer
// Difficulty mix: a domain with no d1 items degrades the form assembler (fail);
// the authoring target is ~20–25% d1 (warn outside it).
const MIN_ITEMS_FOR_MIX_CHECKS = 10;
const D1_SHARE_RANGE: [number, number] = [0.2, 0.25];
// Select-N ("choose two/three") share: an authoring target, warn only.
const TARGET_MULTI_SHARE = 0.25;
const MULTI_SHARE_TOLERANCE = 0.1;

const args = process.argv.slice(2);
const warnOnly = args.includes("--warn-only");
const fileArg = args.includes("--file") ? args[args.indexOf("--file") + 1] : null;

const QDIR = path.join(process.cwd(), "content", "questions");
const files = fileArg
  ? [path.resolve(fileArg)]
  : fs.readdirSync(QDIR).filter((f) => f.endsWith(".json")).sort().map((f) => path.join(QDIR, f));

const errors: string[] = [];
const warnings: string[] = [];
const fail = (m: string) => errors.push(m);
const warn = (m: string) => warnings.push(m);


const len = (s: string) => s.trim().length;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** Content words of a key, for reflex-answer clustering. */
const STOP = new Set(
  "the a an and or of to in for on with that this it is are be as by from at into than then so not no you your their its it's each every any all".split(
    " ",
  ),
);
function tokens(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3 && !STOP.has(w)),
  );
}
function jaccard(a: Set<string>, b: Set<string>): number {
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter || 1);
}

interface FileReport {
  name: string;
  n: number;
  keyIsLongest: number;
  keyMean: number;
  distMean: number;
  positions: Map<number, number>;
  expected: Map<number, number>;
  d1: number;
  multi: number;
}
const reports: FileReport[] = [];
const allKeys: { id: string; text: string; toks: Set<string> }[] = [];

for (const file of files) {
  const name = path.basename(file);
  const raw = JSON.parse(fs.readFileSync(file, "utf8")) as unknown[];
  const items: Question[] = [];
  for (const r of raw) {
    const p = questionSchema.safeParse(r);
    if (!p.success) {
      fail(`${name}: schema — ${JSON.stringify(p.error.issues[0])}`);
      continue;
    }
    items.push(p.data);
  }

  let keyIsLongest = 0;
  const keyLens: number[] = [];
  const distLens: number[] = [];
  const positions = new Map<number, number>();
  const expected = new Map<number, number>();
  let multi = 0;
  let multiFirstTwo = 0;
  let chanceSum = 0;
  let d1 = 0;
  // Expected key-is-longest count if length carried no signal: for a
  // single-answer item with n options that is 1/n.
  let longestChance = 0;

  for (const q of items) {
    const keys = new Set(q.correct);
    const keyChoices = q.choices.filter((c) => keys.has(c.id));
    if (q.difficulty === 1) d1++;
    const distractors = q.choices.filter((c) => !keys.has(c.id));

    // --- per-choice rationales ---------
    for (const c of q.choices) {
      if (!c.rationale) fail(`${q.id}: choice "${c.id}" has no rationale`);
    }
    // --- no dangling option letters in prose (shuffling breaks them) --------
    const prose = [q.explanation ?? "", ...q.choices.map((c) => c.rationale ?? "")].join("\n");
    const refs = prose.match(/\([a-f]\)/g);
    if (refs) {
      fail(
        `${q.id}: rationale prose still references option letters (${[...new Set(refs)].join(", ")}) — options are shuffled at render`,
      );
    }

    // --- option length geometry -----------------------------------
    const lens = q.choices.map((c) => len(c.text));
    const ratio = Math.max(...lens) / Math.min(...lens);
    if (ratio > MAX_OPTION_LENGTH_RATIO) {
      fail(
        `${q.id}: option length ratio ${ratio.toFixed(2)} > ${MAX_OPTION_LENGTH_RATIO} (${Math.min(...lens)}..${Math.max(...lens)} chars)`,
      );
    }
    const sorted = [...q.choices].sort((a, b) => len(b.text) - len(a.text));
    if (sorted.slice(0, keyChoices.length).every((c) => keys.has(c.id))) keyIsLongest++;
    {
      // P(the k keys occupy the k longest slots) = 1 / C(n, k)
      const n = q.choices.length;
      const k = keyChoices.length;
      let comb = 1;
      for (let i = 0; i < k; i++) comb = (comb * (n - i)) / (i + 1);
      longestChance += 1 / comb;
    }
    keyLens.push(...keyChoices.map((c) => len(c.text)));
    distLens.push(...distractors.map((c) => len(c.text)));

    // --- key position ---------------------------------------------
    q.choices.forEach((c, i) => {
      if (keys.has(c.id)) positions.set(i, (positions.get(i) ?? 0) + 1);
      expected.set(i, (expected.get(i) ?? 0) + q.correct.length / q.choices.length);
    });

    // --- select-N convergence cueing ------------------------------
    if (q.type === "multiple") {
      multi++;
      const firstN = q.choices.slice(0, q.correct.length).map((c) => c.id);
      if (firstN.every((id) => keys.has(id))) multiFirstTwo++;
      const n = q.choices.length;
      const k = q.correct.length;
      let comb = 1;
      for (let i = 0; i < k; i++) comb = (comb * (n - i)) / (i + 1);
      chanceSum += 1 / comb;
    }

    // --- provenance ------------------------------------------------
    if (q.subObjective) {
      const resolved = resolveSubObjective(q.subObjective);
      if (!resolved) {
        fail(`${q.id}: subObjective "${q.subObjective}" does not resolve in domains.ts`);
      } else if (resolved.domainId !== q.domainId) {
        fail(
          `${q.id}: subObjective points at ${resolved.domainId}, but the item is ${q.domainId}`,
        );
      }
    } else {
      // Provenance is a failure here, not a warning: the sibling project left it
      // as a warning and ended up with 53 items that never got any.
      fail(`${q.id}: no subObjective`);
    }
    if (!q.sourceUrl) fail(`${q.id}: no sourceUrl`);
    if (!q.lastVerified) fail(`${q.id}: no lastVerified`);

    for (const c of keyChoices) allKeys.push({ id: q.id, text: c.text, toks: tokens(c.text) });
  }

  if (items.length) {
    const rate = keyIsLongest / items.length;
    if (rate > MAX_KEY_IS_LONGEST_RATE) {
      fail(
        `${name}: key is the longest option in ${keyIsLongest}/${items.length} items (${(rate * 100).toFixed(0)}% > ${MAX_KEY_IS_LONGEST_RATE * 100}%)`,
      );
    }
    if (keyIsLongest < longestChance * MIN_KEY_IS_LONGEST_FRACTION_OF_CHANCE) {
      fail(
        `${name}: key is the longest option in only ${keyIsLongest}/${items.length} items, against ~${longestChance.toFixed(1)} expected by chance — an inverted length cue ("never pick the longest") is as gameable as the original`,
      );
    }
    const km = mean(keyLens);
    const dm = mean(distLens);
    if (dm > 0 && km / dm > MAX_KEY_LENGTH_RATIO) {
      fail(
        `${name}: mean key length ${km.toFixed(0)} vs distractor ${dm.toFixed(0)} = ${(km / dm).toFixed(2)}× (> ${MAX_KEY_LENGTH_RATIO}×)`,
      );
    }
    for (const [pos, exp] of [...expected.entries()].sort((a, b) => a[0] - b[0])) {
      if (exp < MIN_POSITION_EXPECTED) continue;
      const obs = positions.get(pos) ?? 0;
      const skew = obs / exp;
      if (skew > POSITION_SKEW || skew < 1 / POSITION_SKEW) {
        warn(
          `${name}: authored keys at position ${String.fromCharCode(97 + pos)} = ${obs}, expected ~${exp.toFixed(1)} (${skew.toFixed(2)}× uniform) — masked by render-time shuffle`,
        );
      }
    }
    if (multi >= 3) {
      const chance = chanceSum; // expected count under random keying
      if (multiFirstTwo > Math.max(1, chance * MAX_FIRST_TWO_MULTIPLIER)) {
        warn(
          `${name}: ${multiFirstTwo}/${multi} select-N items key the first options (expected ~${chance.toFixed(1)} by chance) — masked by render-time shuffle`,
        );
      }
    }
    // --- difficulty and select-all mix ------------------------------------
    if (items.length >= MIN_ITEMS_FOR_MIX_CHECKS) {
      const d1Share = d1 / items.length;
      if (d1 === 0) {
        fail(`${name}: no difficulty-1 items — the form assembler cannot fill its d1 quota from this domain`);
      } else if (d1Share < D1_SHARE_RANGE[0] || d1Share > D1_SHARE_RANGE[1]) {
        warn(
          `${name}: d1 share ${(d1Share * 100).toFixed(0)}% (${d1}/${items.length}) outside the ${D1_SHARE_RANGE[0] * 100}–${D1_SHARE_RANGE[1] * 100}% authoring target`,
        );
      }
      const multiShare = multi / items.length;
      if (Math.abs(multiShare - TARGET_MULTI_SHARE) > MULTI_SHARE_TOLERANCE) {
        warn(
          `${name}: select-all share ${(multiShare * 100).toFixed(0)}% (${multi}/${items.length}) is more than ${MULTI_SHARE_TOLERANCE * 100} points from the ~${TARGET_MULTI_SHARE * 100}% authoring target`,
        );
      }
    }
    reports.push({
      name,
      n: items.length,
      keyIsLongest,
      keyMean: km,
      distMean: dm,
      positions,
      expected,
      d1,
      multi,
    });
  }
}

// --- reflex answers across the whole bank --------------------------
if (!fileArg) {
  const used = new Set<number>();
  const clusters: { size: number; sample: string; ids: string[] }[] = [];
  for (let i = 0; i < allKeys.length; i++) {
    if (used.has(i)) continue;
    const group = [i];
    for (let j = i + 1; j < allKeys.length; j++) {
      if (used.has(j)) continue;
      if (jaccard(allKeys[i].toks, allKeys[j].toks) >= 0.5) {
        group.push(j);
        used.add(j);
      }
    }
    if (group.length >= 3) {
      clusters.push({
        size: group.length,
        sample: allKeys[i].text.slice(0, 70),
        ids: group.map((g) => allKeys[g].id),
      });
    }
  }
  const cap = Math.max(3, Math.round(allKeys.length * MAX_REFLEX_SHARE));
  for (const c of clusters.sort((a, b) => b.size - a.size)) {
    if (c.size > cap) {
      fail(
        `reflex answer keyed ${c.size} times (cap ${cap}): "${c.sample}…" — ${c.ids.slice(0, 8).join(", ")}${c.ids.length > 8 ? ", …" : ""}`,
      );
    }
  }
}

// --- near-duplicate prompts across the whole bank ---------------------------
if (!fileArg) {
  const stems: { id: string; toks: Set<string> }[] = [];
  for (const file of files) {
    for (const r of JSON.parse(fs.readFileSync(file, "utf8")) as unknown[]) {
      const p = questionSchema.safeParse(r);
      if (p.success) stems.push({ id: p.data.id, toks: tokens(p.data.prompt) });
    }
  }
  for (let i = 0; i < stems.length; i++) {
    for (let j = i + 1; j < stems.length; j++) {
      // Generic stems ("Which two statements are correct? Choose two.") share too
      // few content words to compare meaningfully — skip them.
      if (stems[i].toks.size < MIN_STEM_TOKENS || stems[j].toks.size < MIN_STEM_TOKENS) continue;
      const sim = jaccard(stems[i].toks, stems[j].toks);
      if (sim >= MAX_PROMPT_SIMILARITY) {
        fail(`near-duplicate prompts (${sim.toFixed(2)}): ${stems[i].id} ~ ${stems[j].id}`);
      }
    }
  }
}

// --- exam-only holdout must not leak into study surfaces -----------
if (!fileArg) {
  const byId = new Map<string, Question>();
  for (const file of files) {
    for (const r of JSON.parse(fs.readFileSync(file, "utf8")) as unknown[]) {
      const p = questionSchema.safeParse(r);
      if (p.success) byId.set(p.data.id, p.data);
    }
  }
  const quizDir = path.join(process.cwd(), "content", "quizzes");
  if (fs.existsSync(quizDir)) {
    for (const d of fs.readdirSync(quizDir)) {
      const sub = path.join(quizDir, d);
      if (!fs.statSync(sub).isDirectory()) continue;
      for (const f of fs.readdirSync(sub).filter((x) => x.endsWith(".json"))) {
        const quiz = JSON.parse(fs.readFileSync(path.join(sub, f), "utf8")) as {
          id: string;
          questionIds: string[];
        };
        for (const qid of quiz.questionIds) {
          if (byId.get(qid)?.examOnly) {
            fail(`${quiz.id} references ${qid}, which is held out as examOnly`);
          }
        }
      }
    }
  }
  const heldOut = [...byId.values()].filter((q) => q.examOnly).length;
  console.log(`Exam-only holdout: ${heldOut} items.`);
}

// --- report -----------------------------------------------------------------
console.log("\n=== Item geometry ===");
console.log("file                      n  key-longest  key/dist  d1    multi  key positions");
for (const r of reports) {
  const pos = [...r.positions.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([p, n]) => `${String.fromCharCode(97 + p)}=${n}`)
    .join(" ");
  console.log(
    `${r.name.padEnd(24)} ${String(r.n).padStart(3)}  ${String(r.keyIsLongest).padStart(3)} (${String(
      Math.round((r.keyIsLongest / r.n) * 100),
    ).padStart(3)}%)  ${(r.keyMean / (r.distMean || 1)).toFixed(2)}×     ${String(
      Math.round((r.d1 / r.n) * 100),
    ).padStart(2)}%   ${String(Math.round((r.multi / r.n) * 100)).padStart(2)}%    ${pos}`,
  );
}

if (warnings.length) {
  const shown = warnings.slice(0, 15);
  console.log(`\n--- ${warnings.length} warning(s) ---`);
  for (const w of shown) console.log("  ⚠ " + w);
  if (warnings.length > shown.length) console.log(`  … and ${warnings.length - shown.length} more`);
}
if (errors.length) {
  console.error(`\n✗ ${errors.length} lint error(s):`);
  for (const e of errors) console.error("  • " + e);
  if (!warnOnly) process.exit(1);
} else {
  console.log("\n✓ Item geometry within thresholds.\n");
}
