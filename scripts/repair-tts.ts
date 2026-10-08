/**
 * Audits uploaded module narration for style-prompt leaks and patches the
 * affected segments in place.
 *
 * Gemini-TTS sometimes speaks its style prompt instead of the text it was
 * given (see scripts/lib/tts-verify.ts). Re-running generate-tts.ts would
 * re-roll every segment of a module — dozens of fresh chances to leak — so
 * this script re-synthesizes only the bad segments and splices them into the
 * existing MP3.
 *
 * Splicing is exact: the audio is 32 kbps CBR MPEG-2 Layer III, one uniform
 * 96-byte frame per 24 ms, so a manifest offset in seconds maps back to a
 * frame boundary with no re-encoding.
 *
 * Run:
 *   AUDIO_BUCKET=<bucket> npx tsx scripts/repair-tts.ts --check [--module <id>]
 *   AUDIO_BUCKET=<bucket> npx tsx scripts/repair-tts.ts --module <id> [--segment <n>]... [--dry-run]
 *
 * --check audits and reports without writing. A repair run with no --segment
 * audits that module first and fixes whatever it flags. Segment numbers are
 * 0-based indexes into the manifest entry's `segments` array.
 */
import "dotenv/config";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Storage } from "@google-cloud/storage";
import {
  BYTES_PER_SEC,
  detectStyleLeak,
  transcribeHead,
} from "./lib/tts-verify";
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

/** MPEG-2 Layer III @ 32 kbps / 24 kHz: 72 * 32000 / 24000, no padding. */
const FRAME_BYTES = 96;
const CHECK_CONCURRENCY = 6;

const AUDIO_BUCKET = process.env.AUDIO_BUCKET;
if (!AUDIO_BUCKET) throw new Error("AUDIO_BUCKET env var is required");

const MODULES_ROOT = path.join(process.cwd(), "content", "modules");
const MANIFEST_PATH = path.join(process.cwd(), "content", "audio", "manifest.json");

const argv = process.argv.slice(2);
const checkOnly = argv.includes("--check");
const dryRun = argv.includes("--dry-run");
const moduleIdx = argv.indexOf("--module");
const moduleId = moduleIdx === -1 ? null : argv[moduleIdx + 1];
if (moduleIdx !== -1 && !moduleId) throw new Error("--module requires a module id");
if (!checkOnly && !moduleId) throw new Error("--module is required unless --check is given");

const targetSegments: number[] = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] !== "--segment") continue;
  const n = Number(argv[i + 1]);
  if (!Number.isInteger(n) || n < 0) throw new Error("--segment requires a non-negative integer");
  targetSegments.push(n);
}

const bucket = new Storage().bucket(AUDIO_BUCKET);

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

function loadManifest(): Manifest {
  const parsed = audioManifestSchema.parse(JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8")));
  return parsed as Manifest;
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

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      for (let i = next++; i < items.length; i = next++) results[i] = await fn(items[i], i);
    }),
  );
  return results;
}

/**
 * Cuts the concatenated MP3 back into the per-segment buffers it was built
 * from. Manifest offsets are rounded to 1/100 s (≤20 bytes of error), well
 * inside half a frame, so snapping to the nearest frame boundary is exact.
 */
function sliceSegments(audio: Buffer, segments: AudioSegment[], moduleId: string): Buffer[] {
  const bounds = segments.map((s) => Math.round((s.startSec * BYTES_PER_SEC) / FRAME_BYTES) * FRAME_BYTES);
  bounds.push(audio.length);
  for (let i = 0; i < segments.length; i++) {
    if (bounds[i] >= bounds[i + 1]) {
      throw new Error(`${moduleId}: segment ${i} has a non-increasing byte range — manifest and audio disagree`);
    }
    // Every boundary must land on an MPEG-2 Layer III frame header
    // (0xFF 0xF3, or 0xF2 when the optional CRC bit is set).
    if (audio[bounds[i]] !== 0xff || (audio[bounds[i] + 1] & 0xfe) !== 0xf2) {
      throw new Error(
        `${moduleId}: byte ${bounds[i]} (segment ${i}) is not an MP3 frame header — refusing to splice`,
      );
    }
  }
  return segments.map((_, i) => audio.subarray(bounds[i], bounds[i + 1]));
}

interface ModuleState {
  mod: Module;
  entry: ManifestEntry;
  segments: AudioSegment[];
  texts: string[];
  audio: Buffer;
  parts: Buffer[];
}

async function loadModuleState(mod: Module, manifest: Manifest): Promise<ModuleState | string> {
  const entry = manifest.entries[mod.id];
  if (!entry) return "no manifest entry — run tts:generate";
  const speakable = toSpeakableSegments({ title: mod.title, bodyMarkdown: mod.bodyMarkdown });
  const hash = manifestHash(speakable.map((s) => s.text).join("\n\n"));
  if (entry.hash !== hash) return "STALE: content changed since synthesis — run tts:generate";
  if (!entry.segments?.length) return "no segment timings — run tts:generate";
  if (entry.segments.length !== speakable.length) {
    return `segment count mismatch (${entry.segments.length} in manifest vs ${speakable.length} in content) — run tts:generate`;
  }
  const [audio] = await bucket.file(entry.object).download();
  if (audio.length !== entry.bytes) {
    return `object is ${audio.length} bytes but the manifest says ${entry.bytes} — run tts:generate`;
  }
  return {
    mod,
    entry,
    segments: entry.segments,
    texts: speakable.map((s) => s.text),
    audio,
    parts: sliceSegments(audio, entry.segments, mod.id),
  };
}

interface Flag {
  index: number;
  leak: string;
  heard: string;
}

/** Transcribes the head of each segment and returns the ones that leaked. */
async function auditSegments(state: ModuleState): Promise<Flag[]> {
  const results = await mapLimit(state.parts, CHECK_CONCURRENCY, async (part, i) => {
    const heard = await transcribeHead(part);
    const leak = detectStyleLeak(heard, state.texts[i]);
    return leak ? { index: i, leak, heard } : null;
  });
  return results.filter((r): r is Flag => r !== null);
}

async function runCheck(modules: Module[], manifest: Manifest): Promise<number> {
  let flagged = 0;
  for (const mod of modules) {
    const state = await loadModuleState(mod, manifest);
    if (typeof state === "string") {
      console.log(`  ? ${mod.id}: ${state}`);
      flagged++;
      continue;
    }
    const flags = await auditSegments(state);
    if (flags.length === 0) {
      console.log(`  ✓ ${mod.id}: ${state.parts.length} segments clean`);
      continue;
    }
    flagged += flags.length;
    console.log(`  ✗ ${mod.id}: ${flags.length} leaked segment(s)`);
    for (const f of flags) {
      const at = state.segments[f.index].startSec;
      console.log(`      segment ${f.index} @ ${at}s — leaked "${f.leak}"`);
      console.log(`        expected: ${state.texts[f.index].slice(0, 90)}`);
      console.log(`        heard   : ${f.heard.slice(0, 90)}`);
    }
  }
  return flagged;
}

async function runRepair(mod: Module, manifest: Manifest): Promise<void> {
  const state = await loadModuleState(mod, manifest);
  if (typeof state === "string") throw new Error(`${mod.id}: ${state}`);

  let indexes = targetSegments;
  if (indexes.length === 0) {
    console.log(`  auditing ${state.parts.length} segments…`);
    const flags = await auditSegments(state);
    if (flags.length === 0) {
      console.log(`  ✓ ${mod.id}: nothing to repair`);
      return;
    }
    for (const f of flags) {
      console.log(`  ✗ segment ${f.index} @ ${state.segments[f.index].startSec}s leaked "${f.leak}": ${f.heard.slice(0, 80)}`);
    }
    indexes = flags.map((f) => f.index);
  }
  for (const i of indexes) {
    if (i >= state.parts.length) throw new Error(`${mod.id}: segment ${i} is out of range (0..${state.parts.length - 1})`);
  }
  if (dryRun) {
    console.log(`  dry run — would re-synthesize segment(s) ${indexes.join(", ")}`);
    return;
  }

  const parts = [...state.parts];
  for (const i of indexes) {
    const before = parts[i].length;
    parts[i] = await synthesizeSegment(state.texts[i], `${mod.id} segment ${i}`);
    console.log(
      `  ↻ segment ${i}: ${(before / BYTES_PER_SEC).toFixed(2)}s → ${(parts[i].length / BYTES_PER_SEC).toFixed(2)}s`,
    );
  }

  // Rebuild the object and re-derive every offset from actual byte positions,
  // so the segments after a patched one shift by the exact length delta.
  const audio = Buffer.concat(parts);
  const segments: AudioSegment[] = [];
  let bytesSoFar = 0;
  for (let i = 0; i < parts.length; i++) {
    segments.push({ blockIndex: state.segments[i].blockIndex, startSec: startSecFor(bytesSoFar) });
    bytesSoFar += parts[i].length;
  }

  // New object name (audio hash) rather than an overwrite: a deployed manifest
  // still points at the old object and trusts its byte length for Range replies.
  const audioHash = createHash("sha256").update(audio).digest("hex").slice(0, 12);
  const object = `modules/${mod.id}-${audioHash}.mp3`;
  await bucket.file(object).save(audio, { contentType: "audio/mpeg", resumable: false });

  manifest.entries[mod.id] = {
    object,
    hash: state.entry.hash,
    bytes: audio.length,
    estDurationSec: Math.round((audio.length * 8) / 32000),
    segments,
  };
  console.log(
    `  ✓ ${mod.id}: patched ${indexes.length} segment(s) → ${object} (${(audio.length / 1024 / 1024).toFixed(2)} MB, ~${manifest.entries[mod.id].estDurationSec}s)`,
  );
  console.log(`    previous object left in place: ${state.entry.object}`);
}

async function main() {
  const manifest = loadManifest();
  const all = loadModules();
  const modules = moduleId ? all.filter((m) => m.id === moduleId) : all;
  if (modules.length === 0) throw new Error(`No module with id "${moduleId}"`);

  if (checkOnly) {
    console.log(`Auditing ${modules.length} module(s) in gs://${AUDIO_BUCKET}/modules/`);
    const flagged = await runCheck(modules, manifest);
    console.log(flagged === 0 ? "\nAll clean." : `\n${flagged} problem(s) found.`);
    process.exit(flagged === 0 ? 0 : 1);
  }

  console.log(`Repairing ${modules[0].id} (model=${MODEL}, voice=${VOICE})`);
  await runRepair(modules[0], manifest);

  if (!dryRun) {
    const out: Manifest = { model: MODEL, voice: VOICE, stylePrompt: STYLE_PROMPT, entries: manifest.entries };
    audioManifestSchema.parse(out);
    fs.writeFileSync(MANIFEST_PATH, JSON.stringify(out, null, 2) + "\n");
    console.log(`Manifest: ${path.relative(process.cwd(), MANIFEST_PATH)}`);
  }
  if (verificationStats.unverified > 0) {
    console.warn(`WARNING: ${verificationStats.unverified} request(s) were accepted without a leak check.`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
