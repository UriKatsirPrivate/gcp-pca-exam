/**
 * Listens to synthesized audio and reports when Gemini-TTS spoke the style
 * prompt instead of the text it was given.
 *
 * The failure is real and silent: the synthesize response looks normal, but
 * the audio opens with wording lifted from `input.prompt` ("measured pace",
 * "natural emphasis on key terms", …) — sometimes prepended to the text,
 * sometimes replacing a short segment outright. It always happens at the
 * START of a request, so transcribing the first few seconds catches it.
 *
 * Transcription runs on Gemini Flash through the Vertex REST API with ADC —
 * the same credentials the synthesis client already uses.
 */
import { GoogleAuth } from "google-auth-library";

/** Cloud TTS MP3 output is 32 kbps CBR, so bytes map linearly to time. */
export const BYTES_PER_SEC = 4000;

const ASR_MODEL = "gemini-2.5-flash";
const ASR_LOCATION = "global";
const DEFAULT_HEAD_SEC = 8;

const auth = new GoogleAuth({
  scopes: "https://www.googleapis.com/auth/cloud-platform",
});

/**
 * Distinctive wording from both style prompts (see scripts/lib/tts-synthesis.ts).
 * A hit only counts when the phrase is absent from the source text.
 */
const STYLE_LEAK_PHRASES = [
  "measured pace",
  "natural emphasis",
  "brief pause",
  "confident instructor",
  "study module",
  "cloud architect preparing",
  "read clearly",
  "narrate this text",
];

/**
 * Single prompt words worth flagging on their own, because the model also
 * leaks by substituting one word rather than reciting a whole phrase — one
 * segment came back as "The measured control is to limit…" where the text
 * reads "The architectural control…". Same rule: only a leak when the word
 * does not occur in the source text.
 */
const STYLE_LEAK_WORDS = [
  "measured",
  "pace",
  "emphasis",
  "instructor",
  "narrate",
  "narrating",
  "engagingly",
  "pauses",
];

function words(text: string): Set<string> {
  return new Set(text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" "));
}

interface GenerateContentResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
}

/** Transcribes the opening `seconds` of an MP3 buffer. */
export async function transcribeHead(
  mp3: Buffer,
  seconds = DEFAULT_HEAD_SEC,
): Promise<string> {
  const clip = mp3.subarray(0, Math.ceil(seconds * BYTES_PER_SEC));
  const [projectId, client] = await Promise.all([
    auth.getProjectId(),
    auth.getClient(),
  ]);
  const res = await client.request<GenerateContentResponse>({
    url: `https://aiplatform.googleapis.com/v1/projects/${projectId}/locations/${ASR_LOCATION}/publishers/google/models/${ASR_MODEL}:generateContent`,
    method: "POST",
    data: {
      contents: [
        {
          role: "user",
          parts: [
            {
              inline_data: {
                mime_type: "audio/mpeg",
                data: clip.toString("base64"),
              },
            },
            {
              text: "Transcribe this audio clip verbatim. Output only the transcript, nothing else.",
            },
          ],
        },
      ],
      generationConfig: { temperature: 0 },
    },
  });
  const parts = res.data.candidates?.[0]?.content?.parts ?? [];
  return parts
    .map((p) => p.text ?? "")
    .join(" ")
    .trim();
}

/**
 * The style-prompt wording found in a transcript but not in the text that was
 * synthesized, or null when the audio reads clean.
 */
export function detectStyleLeak(
  transcript: string,
  sourceText: string,
): string | null {
  const heard = transcript.toLowerCase();
  const source = sourceText.toLowerCase();
  const phrase = STYLE_LEAK_PHRASES.find(
    (p) => heard.includes(p) && !source.includes(p),
  );
  if (phrase) return phrase;
  const heardWords = words(transcript);
  const sourceWords = words(sourceText);
  return (
    STYLE_LEAK_WORDS.find((w) => heardWords.has(w) && !sourceWords.has(w)) ??
    null
  );
}
