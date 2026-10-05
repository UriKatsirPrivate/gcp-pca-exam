/**
 * Synthesizes narration audio for every module with Gemini-TTS and uploads
 * the MP3s to GCS, then rewrites content/audio/manifest.json.
 *
 * A module is skipped when its manifest hash (sha256 of speakable text +
 * model + voice + style prompt) is unchanged AND the GCS object still exists.
 *
 * Every synthesized request is transcribed back and re-rolled if the style
 * prompt leaked into the speech; scripts/repair-tts.ts audits already-uploaded
 * audio for the same defect and patches single segments.
 *
 * Run: AUDIO_BUCKET=<bucket> npx tsx scripts/generate-tts.ts [--force] [--module <id>]
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { Storage } from "@google-cloud/storage";
import { createHash } from "node:crypto";
import {
  MODEL,
  STYLE_PROMPT,
  VOICE,
  manifestHash,
  startSecFor,
  synthesizeSegment,
  verificationStats,
} from "./lib/tts-synthesis";
import {
  audioManifestSchema,
  moduleSchema,
  type AudioSegment,
  type Module,
} from "../src/lib/content/schema";
import { toSpeakableSegments } from "../src/lib/tts/speakable";

const MODULE_CONCURRENCY = 3;

const AUDIO_BUCKET = process.env.AUDIO_BUCKET;
if (!AUDIO_BUCKET) throw new Error("AUDIO_BUCKET env var is required");

const MODULES_ROOT = path.join(process.cwd(), "content", "modules");
const MANIFEST_PATH = path.join(process.cwd(), "content", "audio", "manifest.json");

const force = process.argv.includes("--force");
const moduleFlagIdx = process.argv.indexOf("--module");
const onlyModuleId = moduleFlagIdx === -1 ? null : process.argv[moduleFlagIdx + 1];
if (moduleFlagIdx !== -1 && !onlyModuleId) throw new Error("--module requires a module id");

const bucket = new Storage().bucket(AUDIO_BUCKET);

// Matches the audioManifestSchema contract in src/lib/content/schema.ts.
interface ManifestEntry {
  object: string;
  hash: string;
  bytes: number;
  estDurationSec: number;
  segments?: AudioSegment[];
}
interface Manifest {
  model: string;
  voice: string;
  stylePrompt: string;
  entries: Record<string, ManifestEntry>;
}

function loadModules(): Module[] {
  const modules: Module[] = [];
  for (const dirent of fs.readdirSync(MODULES_ROOT, { withFileTypes: true })) {
    if (!dirent.isDirectory()) continue;
    const dir = path.join(MODULES_ROOT, dirent.name);
    for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".json"))) {
      modules.push(moduleSchema.parse(JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"))));
    }
  }
  return modules.sort((a, b) => a.id.localeCompare(b.id));
}

function loadManifest(): Manifest {
  const empty: Manifest = { model: MODEL, voice: VOICE, stylePrompt: STYLE_PROMPT, entries: {} };
  if (!fs.existsSync(MANIFEST_PATH)) return empty;
  const parsed = audioManifestSchema.safeParse(JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8")));
  if (!parsed.success) {
    console.warn("Existing manifest is invalid — starting from empty entries.");
    return empty;
  }
  return parsed.data as Manifest;
}

type Result =
  | { id: string; status: "synthesized"; entry: ManifestEntry }
  | { id: string; status: "skipped" }
  | { id: string; status: "failed"; error: string };

async function processModule(mod: Module, existing: ManifestEntry | undefined): Promise<Result> {
  try {
    const speakableSegments = toSpeakableSegments({ title: mod.title, bodyMarkdown: mod.bodyMarkdown });
    const speakable = speakableSegments.map((s) => s.text).join("\n\n");
    const hash = manifestHash(speakable);

    // Entries without segments predate per-segment synthesis: re-synthesize
    // them even when the hash matches, so timing data gets backfilled.
    if (!force && existing?.hash === hash && existing.segments?.length) {
      const [exists] = await bucket.file(existing.object).exists();
      if (exists) {
        console.log(`  – ${mod.id}: skipped (up to date)`);
        return { id: mod.id, status: "skipped" };
      }
      console.log(`  ! ${mod.id}: hash unchanged but object missing — re-synthesizing`);
    }

    // One request per segment so byte offsets give exact per-segment start
    // times (32 kbps CBR). Same-config MP3 parts concatenate cleanly.
    const parts: Buffer[] = [];
    const segments: AudioSegment[] = [];
    let bytesSoFar = 0;
    for (let i = 0; i < speakableSegments.length; i++) {
      const seg = speakableSegments[i];
      const segAudio = await synthesizeSegment(
        seg.text,
        `${mod.id} segment ${i + 1}/${speakableSegments.length}`,
      );
      segments.push({ blockIndex: seg.blockIndex, startSec: startSecFor(bytesSoFar) });
      bytesSoFar += segAudio.length;
      parts.push(segAudio);
    }
    const audio = Buffer.concat(parts);

    // Name the object by the OUTPUT audio hash: TTS output is nondeterministic,
    // so re-synthesis (--force, missing-object repair) must upload a NEW object
    // rather than overwrite one a deployed manifest still points to — the
    // route trusts manifest bytes for Content-Length/Content-Range.
    const audioHash = createHash("sha256").update(audio).digest("hex").slice(0, 12);
    const object = `modules/${mod.id}-${audioHash}.mp3`;

    await bucket.file(object).save(audio, { contentType: "audio/mpeg", resumable: false });

    const entry: ManifestEntry = {
      object,
      hash,
      bytes: audio.length,
      // Cloud TTS MP3 output is 32 kbps CBR, so size determines duration.
      estDurationSec: Math.round((audio.length * 8) / 32000),
      segments,
    };
    console.log(
      `  ✓ ${mod.id}: synthesized (${segments.length} segment${segments.length === 1 ? "" : "s"}, ${(audio.length / 1024 / 1024).toFixed(2)} MB, ~${entry.estDurationSec}s)`,
    );
    return { id: mod.id, status: "synthesized", entry };
  } catch (e) {
    const message = (e as Error).message;
    console.error(`  ✗ ${mod.id}: failed — ${message}`);
    return { id: mod.id, status: "failed", error: message };
  }
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      for (let i = next++; i < items.length; i = next++) {
        results[i] = await fn(items[i]);
      }
    }),
  );
  return results;
}

async function main() {
  let modules = loadModules();
  if (onlyModuleId) {
    modules = modules.filter((m) => m.id === onlyModuleId);
    if (modules.length === 0) throw new Error(`No module with id "${onlyModuleId}"`);
  }
  console.log(`Synthesizing ${modules.length} module(s) -> gs://${AUDIO_BUCKET}/modules/ (model=${MODEL}, voice=${VOICE})`);

  const manifest = loadManifest();
  const results = await mapLimit(modules, MODULE_CONCURRENCY, (mod) =>
    processModule(mod, manifest.entries[mod.id]),
  );

  // Preserve entries for modules skipped or not selected this run.
  const entries: Record<string, ManifestEntry> = { ...manifest.entries };
  for (const r of results) {
    if (r.status === "synthesized") entries[r.id] = r.entry;
  }
  const out: Manifest = { model: MODEL, voice: VOICE, stylePrompt: STYLE_PROMPT, entries };
  audioManifestSchema.parse(out);
  fs.mkdirSync(path.dirname(MANIFEST_PATH), { recursive: true });
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(out, null, 2) + "\n");

  const synthesized = results.filter((r) => r.status === "synthesized");
  const skipped = results.filter((r) => r.status === "skipped");
  const failed = results.filter((r) => r.status === "failed");
  const totalBytes = synthesized.reduce((sum, r) => sum + (r.status === "synthesized" ? r.entry.bytes : 0), 0);
  console.log(
    `\nDone: ${synthesized.length} synthesized, ${skipped.length} skipped, ${failed.length} failed. ` +
      `${(totalBytes / 1024 / 1024).toFixed(2)} MB uploaded. Manifest: ${path.relative(process.cwd(), MANIFEST_PATH)}`,
  );
  if (verificationStats.unverified > 0) {
    console.warn(
      `WARNING: ${verificationStats.unverified} request(s) were accepted without a leak check — ` +
        `run "npm run tts:repair -- --check" to audit the uploaded audio.`,
    );
  }
  if (failed.length > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
