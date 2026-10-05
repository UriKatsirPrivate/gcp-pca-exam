/**
 * Shared Gemini-TTS synthesis primitives for scripts/generate-tts.ts (whole
 * modules) and scripts/repair-tts.ts (individual segments).
 *
 * MODEL / VOICE / STYLE_PROMPT feed the manifest hash — changing any of them
 * invalidates every entry and re-synthesizes the whole course.
 */
import { createHash } from "node:crypto";
import { TextToSpeechClient, protos } from "@google-cloud/text-to-speech";
import { BYTES_PER_SEC, detectStyleLeak, transcribeHead } from "./tts-verify";

export const MODEL = "gemini-2.5-pro-tts";
export const VOICE = "Charon";
export const STYLE_PROMPT =
  "You are narrating a study module for an experienced cloud architect preparing for a certification exam. Read clearly and engagingly, like a confident instructor: measured pace, natural emphasis on key terms, brief pauses between sections.";

/**
 * Leak-resistant prompt used after the normal one has leaked twice.
 *
 * Prompt length drives the leak, not the text: on the two segments that leaked
 * on every retry, 4 trials each measured 3/4 and 2/4 leaks with STYLE_PROMPT
 * and 0/4 with this one. It is not the default because STYLE_PROMPT feeds the
 * manifest hash — swapping it re-synthesizes the whole course — and because
 * the longer prompt gives the better read when it behaves.
 */
const STYLE_PROMPT_FALLBACK =
  "Narrate this text for a study module. Speak like a confident instructor.";

// Gemini-TTS caps text at 4,000 bytes per request; stay well under.
const MAX_CHUNK_BYTES = 3500;
const SYNTH_ATTEMPTS = 3;
// Two rolls of the normal prompt, then two of the fallback.
const LEAK_ATTEMPTS = 4;
const FALLBACK_AFTER = 2;

const ttsClient = new TextToSpeechClient();

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Manifest hash for a module: speakable text plus the synthesis config. */
export function manifestHash(speakableText: string): string {
  return createHash("sha256")
    .update(speakableText + MODEL + VOICE + STYLE_PROMPT)
    .digest("hex")
    .slice(0, 12);
}

/** Start offset in seconds of a byte position, as stored in the manifest. */
export function startSecFor(bytes: number): number {
  return Math.round(((bytes * 8) / 32000) * 100) / 100;
}

/**
 * Splits a segment that exceeds the per-request byte cap into sentence (then
 * word) pieces; the pieces concatenate back into that one segment.
 */
export function splitOversized(text: string): string[] {
  if (Buffer.byteLength(text, "utf8") <= MAX_CHUNK_BYTES) return [text];
  const pieces: string[] = [];
  let current = "";
  const push = () => {
    if (current) pieces.push(current);
    current = "";
  };
  for (const sentence of text.split(/(?<=[.!?])\s+/)) {
    if (Buffer.byteLength(sentence, "utf8") > MAX_CHUNK_BYTES) {
      push();
      const words = sentence.split(" ");
      for (const w of words) {
        const next = current ? `${current} ${w}` : w;
        if (Buffer.byteLength(next, "utf8") > MAX_CHUNK_BYTES && current) {
          push();
          current = w;
        } else {
          current = next;
        }
      }
      push();
      continue;
    }
    const next = current ? `${current} ${sentence}` : sentence;
    if (Buffer.byteLength(next, "utf8") > MAX_CHUNK_BYTES && current) {
      push();
      current = sentence;
    } else {
      current = next;
    }
  }
  push();
  return pieces;
}

async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= SYNTH_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (attempt < SYNTH_ATTEMPTS) {
        const delay = 1000 * 2 ** (attempt - 1);
        console.warn(
          `    retry ${attempt}/${SYNTH_ATTEMPTS} for ${label} in ${delay}ms: ${(e as Error).message}`,
        );
        await sleep(delay);
      }
    }
  }
  throw lastErr;
}

async function synthesizeChunk(text: string, prompt: string): Promise<Buffer> {
  const request: protos.google.cloud.texttospeech.v1.ISynthesizeSpeechRequest =
    {
      input: { prompt, text },
      voice: { languageCode: "en-US", name: VOICE, modelName: MODEL },
      audioConfig: { audioEncoding: "MP3", sampleRateHertz: 24000 },
    };
  const [response] = await ttsClient.synthesizeSpeech(request);
  const audio = response.audioContent;
  if (!audio) throw new Error("empty audioContent in synthesize response");
  return typeof audio === "string"
    ? Buffer.from(audio, "base64")
    : Buffer.from(audio);
}

/** Counts pieces accepted without a listen because transcription itself failed. */
export const verificationStats = { unverified: 0 };

/**
 * Synthesizes one piece and listens to the result, re-rolling when the style
 * prompt leaked into the speech (see scripts/lib/tts-verify.ts) and falling
 * back to the shorter prompt once re-rolling alone has failed twice.
 *
 * A transcription outage must not fail a long synthesis run, so the piece is
 * accepted unverified after the transcription retries are exhausted — counted
 * in `verificationStats` and reported by the caller.
 */
async function synthesizeVerifiedChunk(
  text: string,
  label: string,
): Promise<Buffer> {
  for (let attempt = 1; attempt <= LEAK_ATTEMPTS; attempt++) {
    const prompt =
      attempt > FALLBACK_AFTER ? STYLE_PROMPT_FALLBACK : STYLE_PROMPT;
    const audio = await withRetry(() => synthesizeChunk(text, prompt), label);
    let heard: string;
    try {
      heard = await withRetry(() => transcribeHead(audio), `verify ${label}`);
    } catch (e) {
      verificationStats.unverified++;
      console.warn(
        `    ! ${label}: accepted UNVERIFIED — transcription failed: ${(e as Error).message}`,
      );
      return audio;
    }
    const leak = detectStyleLeak(heard, text);
    if (!leak) return audio;
    const next =
      attempt === FALLBACK_AFTER ? " — switching to the shorter prompt" : "";
    console.warn(
      `    ! ${label}: style prompt leaked ("${leak}") — re-synthesizing (attempt ${attempt}/${LEAK_ATTEMPTS})${next}`,
    );
  }
  throw new Error(
    `${label}: style prompt kept leaking into the audio after ${LEAK_ATTEMPTS} attempts`,
  );
}

/**
 * Synthesizes one speakable segment, splitting oversized text and verifying
 * every request (each is a fresh chance for the prompt to leak).
 */
export async function synthesizeSegment(
  text: string,
  label: string,
): Promise<Buffer> {
  const pieces = splitOversized(text);
  const buffers: Buffer[] = [];
  for (let j = 0; j < pieces.length; j++) {
    const pieceLabel =
      pieces.length > 1 ? `${label} piece ${j + 1}/${pieces.length}` : label;
    buffers.push(await synthesizeVerifiedChunk(pieces[j], pieceLabel));
  }
  return Buffer.concat(buffers);
}

export { BYTES_PER_SEC };
