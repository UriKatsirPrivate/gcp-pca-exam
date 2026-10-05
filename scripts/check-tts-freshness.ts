/**
 * Fast, offline check for narration that no longer matches the page text.
 *
 * `tts:repair --check` is the thorough audit — it downloads every MP3 from GCS
 * and transcribes it back to catch style-prompt leaks — which makes it far too
 * slow to sit in front of a build. This does the one part that needs no network:
 * recompute each module's manifest hash from its current speakable text plus the
 * synthesis config, and compare it to what the manifest recorded.
 *
 * That catches the failure mode that actually bites, and the one `AGENTS.md`
 * warns about: editing module text does not error, it silently leaves the app
 * narrating a page that no longer exists. It does NOT catch a leak in
 * already-synthesized audio — only `tts:repair --check` does that.
 *
 * Exit codes: 0 = every module fresh, 1 = at least one stale/missing.
 *
 * Run: npm run tts:check        (add --quiet to print only the summary line)
 */
import fs from "node:fs";
import path from "node:path";
import { manifestHash } from "./lib/tts-synthesis";
import { toSpeakableSegments } from "../src/lib/tts/speakable";

const quiet = process.argv.includes("--quiet");

const CONTENT = path.join(process.cwd(), "content");
const manifestPath = path.join(CONTENT, "audio", "manifest.json");

if (!fs.existsSync(manifestPath)) {
  console.log("No audio manifest — narration has never been generated. Nothing to check.");
  process.exit(0);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
  entries: Record<string, { hash: string; segments?: unknown[] }>;
};

const stale: string[] = [];
const missing: string[] = [];
let fresh = 0;

for (const domain of fs.readdirSync(path.join(CONTENT, "modules"))) {
  const dir = path.join(CONTENT, "modules", domain);
  if (!fs.statSync(dir).isDirectory()) continue;
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    const mod = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")) as {
      id: string;
      title: string;
      bodyMarkdown: string;
    };
    const entry = manifest.entries[mod.id];
    if (!entry) {
      missing.push(mod.id);
      continue;
    }
    const speakable = toSpeakableSegments({ title: mod.title, bodyMarkdown: mod.bodyMarkdown });
    const hash = manifestHash(speakable.map((s) => s.text).join("\n\n"));
    if (hash === entry.hash) fresh++;
    else stale.push(mod.id);
  }
}

const total = fresh + stale.length + missing.length;

if (stale.length === 0 && missing.length === 0) {
  console.log(`✓ Narration is in sync with the page text for all ${total} modules.`);
  process.exit(0);
}

if (!quiet) {
  console.log("");
  console.log(
    `⚠  Narration is STALE for ${stale.length + missing.length} of ${total} modules — the audio`,
  );
  console.log("   no longer matches the text on the page. This is not an error anywhere else in");
  console.log("   the pipeline: the app will happily serve the old narration.");
  console.log("");
  for (const id of stale) console.log(`     stale    ${id}`);
  for (const id of missing) console.log(`     missing  ${id}`);
  console.log("");
  console.log("   Fix:    AUDIO_BUCKET=<bucket> npx tsx scripts/generate-tts.ts");
  console.log("   Verify: AUDIO_BUCKET=<bucket> npm run tts:repair -- --check   (slow, downloads + transcribes)");
  console.log("");
} else {
  console.log(`⚠ Narration stale for ${stale.length + missing.length}/${total} modules — run tts:generate.`);
}
process.exit(1);
