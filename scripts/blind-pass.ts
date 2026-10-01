/**
 * Blind answer pass tooling (see docs/content-authoring.md).
 *
 *   npx tsx scripts/blind-pass.ts export [--out /tmp/blind] [--batches 6]
 *     Writes key-stripped copies of the whole bank (no `correct`, `explanation`,
 *     `rationale`, provenance) to <out>/batch-N.json, outside the content tree.
 *     Multi-select items keep a `select` count.
 *
 *   npx tsx scripts/blind-pass.ts diff <answers.json> [<answers2.json> …]
 *     Each answers file is an array of
 *       { id, chosen: string[], confidence: "high"|"medium"|"low", flags?: string[], note?: string }
 *     Prints agreement with the real keys, confident misses, and every flagged item.
 */
import fs from "node:fs";
import path from "node:path";
import { questionSchema, type Question } from "../src/lib/content/schema";

const QDIR = path.join(process.cwd(), "content", "questions");

function loadBank(): Question[] {
  const out: Question[] = [];
  for (const f of fs.readdirSync(QDIR).filter((x) => x.endsWith(".json")).sort()) {
    for (const raw of JSON.parse(fs.readFileSync(path.join(QDIR, f), "utf8")) as unknown[]) {
      out.push(questionSchema.parse(raw));
    }
  }
  return out;
}

const [cmd, ...rest] = process.argv.slice(2);

if (cmd === "export") {
  const outDir = rest.includes("--out") ? rest[rest.indexOf("--out") + 1] : "/tmp/blind";
  const nBatches = rest.includes("--batches") ? Number(rest[rest.indexOf("--batches") + 1]) : 6;
  if (path.resolve(outDir).startsWith(path.join(process.cwd(), "content"))) {
    throw new Error("--out must be outside content/");
  }
  fs.mkdirSync(outDir, { recursive: true });
  const bank = loadBank();
  const stripped = bank.map((q) => ({
    id: q.id,
    type: q.type,
    select: q.type === "multiple" ? q.correct.length : 1,
    caseStudyId: q.caseStudyId ?? null,
    prompt: q.prompt,
    exhibit: q.exhibit ?? null,
    choices: q.choices.map((c) => ({ id: c.id, text: c.text })),
  }));
  const size = Math.ceil(stripped.length / nBatches);
  for (let i = 0; i < nBatches; i++) {
    const slice = stripped.slice(i * size, (i + 1) * size);
    if (slice.length === 0) continue;
    fs.writeFileSync(path.join(outDir, `batch-${i + 1}.json`), JSON.stringify(slice, null, 1));
    console.log(`batch-${i + 1}.json: ${slice.length} items`);
  }
  console.log(`\nExported ${stripped.length} key-stripped items to ${outDir}`);
} else if (cmd === "diff") {
  const bank = new Map(loadBank().map((q) => [q.id, q]));
  type Ans = { id: string; chosen: string[]; confidence: string; flags?: string[]; note?: string };
  let total = 0;
  let hit = 0;
  const misses: string[] = [];
  const lowHits: string[] = [];
  const flagged: string[] = [];
  for (const file of rest) {
    for (const a of JSON.parse(fs.readFileSync(file, "utf8")) as Ans[]) {
      const q = bank.get(a.id);
      if (!q) {
        console.log(`unknown id ${a.id} in ${file}`);
        continue;
      }
      total++;
      const ok = a.chosen.length === q.correct.length && a.chosen.every((c) => q.correct.includes(c));
      if (ok) hit++;
      const line = `${a.id} [${a.confidence}] chose ${a.chosen.join(",")} key ${q.correct.join(",")}${a.note ? ` — ${a.note}` : ""}`;
      if (!ok) misses.push((a.confidence === "high" ? "CONFIDENT MISS " : "miss ") + line);
      else if (a.confidence === "low") lowHits.push(line);
      if (a.flags?.length) flagged.push(`${a.id} flags=${a.flags.join("|")}${a.note ? ` — ${a.note}` : ""}`);
    }
  }
  console.log(`Agreement: ${hit}/${total}`);
  console.log(`\n--- Misses (${misses.length}) ---\n${misses.join("\n")}`);
  console.log(`\n--- Low-confidence hits (${lowHits.length}) ---\n${lowHits.join("\n")}`);
  console.log(`\n--- Flagged (${flagged.length}) ---\n${flagged.join("\n")}`);
} else {
  console.log("usage: blind-pass.ts export|diff …");
  process.exit(1);
}
