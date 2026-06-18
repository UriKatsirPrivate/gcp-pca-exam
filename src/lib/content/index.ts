import "server-only";
import fs from "node:fs";
import path from "node:path";
import {
  caseStudySchema,
  moduleSchema,
  moduleVideosSchema,
  questionSchema,
  quizSchema,
  DOMAIN_IDS,
  type CaseStudy,
  type CaseStudyId,
  type DomainId,
  type Module,
  type Question,
  type Quiz,
  type Video,
} from "./schema";
import { DOMAINS, DOMAIN_BY_ID, getDomain } from "./domains";

const CONTENT_DIR = path.join(process.cwd(), "content");

function readJson(file: string): unknown {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function listJson(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => path.join(dir, f));
}

interface ContentStore {
  questions: Question[]; // domain question bank (excludes assessment)
  assessment: Question[];
  modules: Module[];
  quizzes: Quiz[];
  caseStudies: CaseStudy[];
  questionById: Map<string, Question>;
  moduleById: Map<string, Module>;
  quizById: Map<string, Quiz>;
  caseStudyById: Map<CaseStudyId, CaseStudy>;
  modulesByDomain: Map<DomainId, Module[]>;
  questionsByDomain: Map<DomainId, Question[]>;
  videosByModule: Map<string, Video[]>;
}

function build(): ContentStore {
  const questions: Question[] = [];
  const assessment: Question[] = [];
  const modules: Module[] = [];
  const quizzes: Quiz[] = [];
  const caseStudies: CaseStudy[] = [];

  // Domain question banks: content/questions/<domainId>.json
  for (const domainId of DOMAIN_IDS) {
    const f = path.join(CONTENT_DIR, "questions", `${domainId}.json`);
    if (!fs.existsSync(f)) continue;
    const arr = readJson(f) as unknown[];
    for (const raw of arr) questions.push(questionSchema.parse(raw));
  }

  // Diagnostic assessment: content/questions/assessment.json
  const assessmentFile = path.join(CONTENT_DIR, "questions", "assessment.json");
  if (fs.existsSync(assessmentFile)) {
    const arr = readJson(assessmentFile) as unknown[];
    for (const raw of arr) assessment.push(questionSchema.parse(raw));
  }

  // Modules & quizzes: content/{modules,quizzes}/<domainId>/*.json
  for (const domainId of DOMAIN_IDS) {
    for (const f of listJson(path.join(CONTENT_DIR, "modules", domainId))) {
      modules.push(moduleSchema.parse(readJson(f)));
    }
    for (const f of listJson(path.join(CONTENT_DIR, "quizzes", domainId))) {
      quizzes.push(quizSchema.parse(readJson(f)));
    }
  }

  // Derive a study-weighted time estimate per module, overriding the authored
  // estMinutes so the badge AND the study-plan budget reflect actual content:
  //   reading time (~200 wpm) ×2 for exam-prep depth (re-reading + thinking)
  //   + ~1.5 min per quiz question + ~1 min per diagram. (Videos are optional
  //   and not counted.) Floored at 5 min.
  const quizQuestionCountByModule = new Map<string, number>();
  for (const q of quizzes) {
    quizQuestionCountByModule.set(q.moduleId, q.questionIds.length);
  }
  for (const m of modules) {
    const words = (m.bodyMarkdown.match(/\S+/g) ?? []).length;
    const readingMin = words / 200;
    const quizQ = quizQuestionCountByModule.get(m.id) ?? 0;
    m.estMinutes = Math.max(
      5,
      Math.round(readingMin * 2 + quizQ * 1.5 + m.diagrams.length),
    );
  }

  // Case studies: content/case-studies/*.json
  for (const f of listJson(path.join(CONTENT_DIR, "case-studies"))) {
    caseStudies.push(caseStudySchema.parse(readJson(f)));
  }

  // Per-module videos: content/videos/modules.json (a moduleId -> videos map; optional)
  const videosByModule = new Map<string, Video[]>();
  const videosFile = path.join(CONTENT_DIR, "videos", "modules.json");
  if (fs.existsSync(videosFile)) {
    const parsed = moduleVideosSchema.parse(readJson(videosFile));
    for (const [moduleId, vids] of Object.entries(parsed)) {
      videosByModule.set(moduleId, vids);
    }
  }

  const questionById = new Map<string, Question>();
  for (const q of [...questions, ...assessment]) questionById.set(q.id, q);

  const moduleById = new Map(modules.map((m) => [m.id, m]));
  const quizById = new Map(quizzes.map((q) => [q.id, q]));
  const caseStudyById = new Map(caseStudies.map((c) => [c.id, c]));

  const modulesByDomain = new Map<DomainId, Module[]>();
  const questionsByDomain = new Map<DomainId, Question[]>();
  for (const domainId of DOMAIN_IDS) {
    modulesByDomain.set(
      domainId,
      modules
        .filter((m) => m.domainId === domainId)
        .sort((a, b) => a.order - b.order),
    );
    questionsByDomain.set(
      domainId,
      questions.filter((q) => q.domainId === domainId),
    );
  }

  return {
    questions,
    assessment,
    modules,
    quizzes,
    caseStudies,
    questionById,
    moduleById,
    quizById,
    caseStudyById,
    modulesByDomain,
    questionsByDomain,
    videosByModule,
  };
}

// Cache the validated content for the lifetime of the server process.
const globalForContent = globalThis as unknown as { __content?: ContentStore };
function store(): ContentStore {
  if (!globalForContent.__content) globalForContent.__content = build();
  return globalForContent.__content;
}

// ---- Public accessors -----------------------------------------------------

export { DOMAINS, DOMAIN_BY_ID, getDomain };

export function getAllQuestions(): Question[] {
  return store().questions;
}
export function getAssessmentQuestions(): Question[] {
  return store().assessment;
}
export function getQuestion(id: string): Question | undefined {
  return store().questionById.get(id);
}
export function getQuestions(ids: string[]): Question[] {
  const s = store();
  return ids.map((id) => s.questionById.get(id)).filter((q): q is Question => !!q);
}
export function getQuestionsByDomain(domainId: DomainId): Question[] {
  return store().questionsByDomain.get(domainId) ?? [];
}
export function getModuleVideos(moduleId: string): Video[] {
  // `?.` guards against a stale cached store (e.g. a dev server that built the
  // store before this field existed); degrades to "no videos" instead of a 500.
  return store().videosByModule?.get(moduleId) ?? [];
}

/** In-place Fisher–Yates shuffle. */
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Build a freshly randomized, domain-balanced diagnostic set by sampling from
 * the union of the assessment pool and the per-domain question banks. No
 * persistence needed: questionById indexes both, and grading reloads by id.
 */
export function sampleAssessment(perDomain = 3): Question[] {
  const s = store();
  const sampled: Question[] = [];
  for (const domainId of DOMAIN_IDS) {
    const byId = new Map<string, Question>();
    for (const q of s.assessment) {
      if (q.domainId === domainId) byId.set(q.id, q);
    }
    for (const q of getQuestionsByDomain(domainId)) byId.set(q.id, q);
    const pool = shuffle([...byId.values()]);
    sampled.push(...pool.slice(0, perDomain));
  }
  return shuffle(sampled);
}
export function getModules(domainId: DomainId): Module[] {
  return store().modulesByDomain.get(domainId) ?? [];
}
export function getAllModules(): Module[] {
  return store().modules;
}
export function getModule(id: string): Module | undefined {
  return store().moduleById.get(id);
}
export function getQuiz(id: string): Quiz | undefined {
  return store().quizById.get(id);
}
export function getQuizByModule(moduleId: string): Quiz | undefined {
  return store().quizzes.find((q) => q.moduleId === moduleId);
}
export function getCaseStudies(): CaseStudy[] {
  return store().caseStudies;
}
export function getCaseStudy(id: CaseStudyId): CaseStudy | undefined {
  return store().caseStudyById.get(id);
}

/** Strip answer keys before sending a question to the client during an active attempt. */
export function toClientQuestion(q: Question) {
  return {
    id: q.id,
    type: q.type,
    domainId: q.domainId,
    caseStudyId: q.caseStudyId,
    prompt: q.prompt,
    choices: q.choices,
    difficulty: q.difficulty,
  };
}
export type ClientQuestion = ReturnType<typeof toClientQuestion>;
