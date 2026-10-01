import "server-only";
import fs from "node:fs";
import path from "node:path";
import {
  caseStudySchema,
  domainTakeawaysSchema,
  moduleSchema,
  moduleVideosSchema,
  questionSchema,
  quizSchema,
  DOMAIN_IDS,
  type CaseStudy,
  type CaseStudyId,
  type DomainId,
  type DomainTakeaways,
  type Module,
  type Question,
  type Quiz,
  type Video,
} from "./schema";
import { DOMAINS, DOMAIN_BY_ID, getDomain } from "./domains";
import { parseExamTips } from "./exam-tips";
import { choiceOrderSeed, seededShuffle } from "./shuffle";

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
  takeawaysByDomain: Map<DomainId, DomainTakeaways>;
  examTipsByDomain: Map<DomainId, ExamTipGroup[]>;
}

/** One module's exam tips, for the pre-exam Review page. */
export interface ExamTipGroup {
  moduleId: string;
  moduleTitle: string;
  tips: string[];
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

  // Domain recap takeaways: content/takeaways/<domainId>.json (optional per domain)
  const takeawaysByDomain = new Map<DomainId, DomainTakeaways>();
  for (const domainId of DOMAIN_IDS) {
    const f = path.join(CONTENT_DIR, "takeaways", `${domainId}.json`);
    if (!fs.existsSync(f)) continue;
    const parsed = domainTakeawaysSchema.parse(readJson(f));
    if (parsed.takeaways.length === 0) continue;
    takeawaysByDomain.set(domainId, parsed);
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

  // Exam tips, derived from each module's trailing `## Exam tips` section (see
  // ./exam-tips). Throwing is deliberate: the store is built once and cached, so
  // a module that stops matching the expected shape must fail the next boot
  // loudly instead of quietly vanishing from /review.
  const examTipsByDomain = new Map<DomainId, ExamTipGroup[]>();
  for (const domainId of DOMAIN_IDS) {
    const groups: ExamTipGroup[] = [];
    for (const m of modulesByDomain.get(domainId) ?? []) {
      const tips = parseExamTips(m.bodyMarkdown);
      if (tips.length === 0) {
        throw new Error(`Module ${m.id} has no parseable "## Exam tips" bullet list`);
      }
      groups.push({ moduleId: m.id, moduleTitle: m.title, tips });
    }
    examTipsByDomain.set(domainId, groups);
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
    takeawaysByDomain,
    examTipsByDomain,
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
/**
 * A domain's bank. Items flagged `examOnly` are held out of study surfaces
 * (quizzes, practice, the diagnostic) so the simulation exam has a pool the
 * candidate has not already answered — pass `includeExamOnly` for exam builds.
 */
export function getQuestionsByDomain(
  domainId: DomainId,
  { includeExamOnly = false }: { includeExamOnly?: boolean } = {},
): Question[] {
  const all = store().questionsByDomain.get(domainId) ?? [];
  return includeExamOnly ? all : all.filter((q) => !q.examOnly);
}

/** Every item held out for simulation exams only. */
export function getExamOnlyQuestions(): Question[] {
  return store().questions.filter((q) => q.examOnly);
}

/**
 * Questions tagged with any of `concepts`, for the drill/practice mode. Excludes
 * `excludeIds`, returns a freshly shuffled slice capped at `limit`. Drawn from the
 * domain banks (not the diagnostic-only pool).
 */
export function getQuestionsByConcept(
  concepts: string[],
  { limit = 20, excludeIds }: { limit?: number; excludeIds?: Set<string> } = {},
): Question[] {
  if (concepts.length === 0) return [];
  const want = new Set(concepts);
  const matches = store().questions.filter(
    (q) =>
      !q.examOnly && !excludeIds?.has(q.id) && q.concepts.some((c) => want.has(c)),
  );
  return shuffle(matches).slice(0, limit);
}
export function getDomainTakeaways(domainId: DomainId): DomainTakeaways | null {
  // `?.` guards against a stale cached store (e.g. a dev server that built the
  // store before this field existed); degrades to "no takeaways" instead of a 500.
  return store().takeawaysByDomain?.get(domainId) ?? null;
}

/** A domain's exam tips, grouped by module in study order. */
export function getExamTips(domainId: DomainId): ExamTipGroup[] {
  return store().examTipsByDomain?.get(domainId) ?? [];
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
 * How many diagnostic items to serve. A flat n-per-domain sample would measure a
 * 25% domain and a 12.5% one identically, and mastery, study order and
 * proficiency labels all inherit that distortion — so the diagnostic is sampled
 * with the same blueprint quotas as the exam.
 */
export const ASSESSMENT_QUESTION_COUNT = 30;

/**
 * Per-domain quotas for a form of `total` items, allocated by blueprint weight
 * with a floor of 2 and largest-remainder rounding so the quotas sum exactly.
 * Shared by the diagnostic and the exam generator.
 */
export function blueprintQuotas(total: number): { domainId: DomainId; quota: number }[] {
  const FLOOR = 2;
  const quotas = DOMAINS.map((d) => {
    const exact = Math.max(FLOOR, (d.weightPct / 100) * total);
    return { domainId: d.id, quota: Math.floor(exact), frac: exact - Math.floor(exact) };
  });
  let remainder = total - quotas.reduce((n, q) => n + q.quota, 0);
  const order = [...quotas].sort((a, b) => b.frac - a.frac);
  for (let i = 0; remainder > 0 && order.length > 0; i++, remainder--) {
    order[i % order.length].quota += 1;
  }
  // Overshoot (possible once the floor binds): trim the largest quotas first.
  while (remainder < 0) {
    const biggest = [...quotas].sort((a, b) => b.quota - a.quota)[0];
    if (biggest.quota <= FLOOR) break;
    biggest.quota -= 1;
    remainder++;
  }
  return quotas.map(({ domainId, quota }) => ({ domainId, quota }));
}

/**
 * Build a freshly randomized, blueprint-weighted diagnostic set by sampling from
 * the union of the assessment pool and the non-held-out domain banks. No
 * persistence needed: questionById indexes both, and grading reloads by id.
 */
export function sampleAssessment(total = ASSESSMENT_QUESTION_COUNT): Question[] {
  const s = store();
  const sampled: Question[] = [];
  for (const { domainId, quota } of blueprintQuotas(total)) {
    const byId = new Map<string, Question>();
    for (const q of s.assessment) {
      if (q.domainId === domainId && !q.examOnly) byId.set(q.id, q);
    }
    for (const q of getQuestionsByDomain(domainId)) byId.set(q.id, q);
    const pool = shuffle([...byId.values()]);
    sampled.push(...pool.slice(0, quota));
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

/**
 * Strip answer keys before sending a question to the client during an active
 * attempt, and shuffle the options.
 *
 * The shuffle is deterministic in `seed`: pass the attempt id so the runner and
 * that attempt's review screen agree on the order without persisting it. Choice
 * ids are unchanged, so grading and stored answers are unaffected. Per-choice
 * rationales are withheld here — they give the key away — see
 * `toRevealQuestion`.
 */
export function toClientQuestion(q: Question, { seed }: { seed?: string } = {}) {
  return {
    id: q.id,
    type: q.type,
    domainId: q.domainId,
    caseStudyId: q.caseStudyId,
    concepts: q.concepts,
    prompt: q.prompt,
    exhibit: q.exhibit ?? null,
    choices: seededShuffle(
      q.choices.map((c) => ({ id: c.id, text: c.text })),
      choiceOrderSeed(q.id, seed),
    ),
    difficulty: q.difficulty,
  };
}
export type ClientQuestion = ReturnType<typeof toClientQuestion>;

/**
 * A question with its key, per-choice rationales and takeaway — for review
 * screens and low-stakes quizzes that grade in the browser. Uses the same seeded
 * option order as `toClientQuestion`, so a review lines up with what the
 * candidate saw.
 */
export function toRevealQuestion(q: Question, { seed }: { seed?: string } = {}) {
  const base = toClientQuestion(q, { seed });
  const byId = new Map(q.choices.map((c) => [c.id, c]));
  return {
    ...base,
    choices: base.choices.map((c) => ({ ...c, rationale: byId.get(c.id)?.rationale })),
    correct: q.correct,
    explanation: q.explanation,
  };
}
