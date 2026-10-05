import { z } from "zod";

// ---------------------------------------------------------------------------
// Canonical id sets (mirror the exam guide v6.1 domains + current case studies)
// ---------------------------------------------------------------------------

export const DOMAIN_IDS = [
  "design-plan",
  "provision",
  "security",
  "optimize-process",
  "manage-impl",
  "ops-excellence",
] as const;

export const CASE_STUDY_IDS = [
  "altostrat-media",
  "cymbal-retail",
  "ehr-healthcare",
  "knightmotives-automotive",
] as const;

export const PILLARS = [
  "operational-excellence",
  "security",
  "reliability",
  "cost",
  "performance",
  "sustainability",
] as const;

export const domainIdSchema = z.enum(DOMAIN_IDS);
export const caseStudyIdSchema = z.enum(CASE_STUDY_IDS);
export const pillarSchema = z.enum(PILLARS);

export type DomainId = (typeof DOMAIN_IDS)[number];
export type CaseStudyId = (typeof CASE_STUDY_IDS)[number];
export type Pillar = (typeof PILLARS)[number];

export const PROFICIENCY_LEVELS = [
  "novice",
  "developing",
  "proficient",
  "expert",
] as const;
export type Proficiency = (typeof PROFICIENCY_LEVELS)[number];

// ---------------------------------------------------------------------------
// Content schemas (authored JSON under /content)
// ---------------------------------------------------------------------------

// Per-choice rationale (why this option is right/wrong). Authored per choice
// rather than as letter-prefixed prose inside `explanation` so that choices can
// be shuffled at render without the rationale referring to the wrong letter.
export const choiceSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  rationale: z.string().min(1).optional(),
});

// An evidence artifact shown with the stem: a log excerpt, config/IaC snippet,
// code block, metrics or cost table the candidate must reason from. Rendered
// verbatim in a monospace block (`table` is rendered as markdown).
export const exhibitSchema = z.object({
  label: z.string().min(1),
  format: z.enum(["log", "config", "code", "table", "metrics"]),
  content: z.string().min(1),
  // Fence info-string for `code`/`config`/`log` (e.g. "yaml", "python").
  language: z.string().optional(),
});

export const questionSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["single", "multiple"]),
  domainId: domainIdSchema,
  concepts: z.array(z.string()).default([]),
  caseStudyId: caseStudyIdSchema.optional(),
  // The exam-guide objective this item assesses, as a reference of the form
  // "<domainId>.<n>" (1-based) into ./domains.ts. A reference, not the text.
  // Resolve with `resolveSubObjective()`.
  subObjective: z
    .string()
    .regex(/^[a-z-]+\.\d+$/, 'must be a "<domainId>.<n>" reference into domains.ts')
    .optional(),
  // Provenance: the doc page the keyed answer was verified against, and the date
  // it was last checked. Drift control — see the content lint.
  sourceUrl: z.string().url().optional(),
  lastVerified: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  exhibit: exhibitSchema.optional(),
  // Held out of quizzes, practice and the diagnostic so simulation exams draw
  // novel items.
  examOnly: z.boolean().default(false),
  prompt: z.string().min(1),
  choices: z.array(choiceSchema).min(2),
  correct: z.array(z.string()).min(1),
  // Optional overall takeaway. Per-choice reasoning belongs in
  // `choices[].rationale`; this is only for what doesn't fit a single choice.
  explanation: z.string().min(1).optional(),
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
});

export const videoSchema = z.object({
  youtubeId: z.string().min(1),
  title: z.string().min(1),
  channel: z.string().optional(),
  durationMin: z.number().int().positive().optional(),
});

// Per-module curated videos: a map of moduleId -> list of videos.
// Authored in content/videos/modules.json.
export const moduleVideosSchema = z.record(z.string(), z.array(videoSchema));

export type Video = z.infer<typeof videoSchema>;

// One narrated segment: startSec is its offset in the module MP3, blockIndex
// the element-child index it maps to in the rendered markdown container
// (null = the module title). Written by scripts/generate-tts.ts.
export const audioSegmentSchema = z.object({
  blockIndex: z.number().int().min(0).nullable(),
  startSec: z.number().min(0),
});

// One generated TTS narration per module. `object` is the GCS object path
// under gs://$AUDIO_BUCKET/ (no bucket prefix). `segments` is optional so
// manifests from before per-segment synthesis still validate — the UI falls
// back to proportional auto-scroll and no highlighting without it.
export const moduleAudioSchema = z.object({
  object: z.string().min(1),
  hash: z.string().min(1),
  bytes: z.number().int().positive(),
  estDurationSec: z.number().int().positive(),
  segments: z.array(audioSegmentSchema).optional(),
});

// Generated audio manifest: content/audio/manifest.json (written by the
// generate script; absent until it has run).
export const audioManifestSchema = z.object({
  model: z.string().min(1),
  voice: z.string().min(1),
  stylePrompt: z.string().min(1),
  entries: z.record(z.string(), moduleAudioSchema),
});

export type AudioSegment = z.infer<typeof audioSegmentSchema>;
export type ModuleAudio = z.infer<typeof moduleAudioSchema>;

// Domain-level recap takeaways, authored in content/takeaways/<domainId>.json.
export const takeawaySchema = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
});

export const domainTakeawaysSchema = z.object({
  domainId: domainIdSchema,
  takeaways: z.array(takeawaySchema).default([]),
  sources: z.array(z.string()).default([]),
});

export type Takeaway = z.infer<typeof takeawaySchema>;
export type DomainTakeaways = z.infer<typeof domainTakeawaysSchema>;

export const diagramSchema = z.object({
  title: z.string().min(1),
  mermaid: z.string().min(1),
});

export const moduleSchema = z.object({
  id: z.string().min(1),
  domainId: domainIdSchema,
  title: z.string().min(1),
  order: z.number().int().nonnegative(),
  estMinutes: z.number().int().positive(),
  bodyMarkdown: z.string().min(1),
  diagrams: z.array(diagramSchema).default([]),
  quizId: z.string().min(1),
});

export const quizSchema = z.object({
  id: z.string().min(1),
  moduleId: z.string().min(1),
  questionIds: z.array(z.string()).min(1),
});

export const caseStudySchema = z.object({
  id: caseStudyIdSchema,
  name: z.string().min(1),
  sourceUrl: z.string().url().optional(),
  sourceVerified: z.boolean().optional(),
  sections: z.object({
    overview: z.string().min(1),
    solutionConcept: z.string().min(1),
    existingTech: z.string().min(1),
    businessReqs: z.array(z.string()).min(1),
    technicalReqs: z.array(z.string()).min(1),
    executiveStatement: z.string().min(1),
  }),
});

export type Choice = z.infer<typeof choiceSchema>;
export type Exhibit = z.infer<typeof exhibitSchema>;
export type Question = z.infer<typeof questionSchema>;
export type Diagram = z.infer<typeof diagramSchema>;
export type Module = z.infer<typeof moduleSchema>;
export type Quiz = z.infer<typeof quizSchema>;
export type CaseStudy = z.infer<typeof caseStudySchema>;

export interface Domain {
  id: DomainId;
  index: number;
  title: string;
  shortTitle: string;
  weightPct: number;
  blurb: string;
  subObjectives: string[];
  pillars: Pillar[];
}
