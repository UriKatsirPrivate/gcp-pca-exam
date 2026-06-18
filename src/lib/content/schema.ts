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

export const choiceSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
});

export const questionSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["single", "multiple"]),
  domainId: domainIdSchema,
  concepts: z.array(z.string()).default([]),
  caseStudyId: caseStudyIdSchema.optional(),
  prompt: z.string().min(1),
  choices: z.array(choiceSchema).min(2),
  correct: z.array(z.string()).min(1),
  explanation: z.string().min(1),
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
