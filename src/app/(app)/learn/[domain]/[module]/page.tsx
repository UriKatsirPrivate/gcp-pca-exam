import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, ChevronLeft, Clock } from "lucide-react";
import {
  getDomain,
  getModule,
  getModuleAudio,
  getModuleVideos,
  getModules,
  getQuestions,
  getQuizByModule,
  toRevealQuestion,
} from "@/lib/content";
import { DOMAIN_IDS, type DomainId } from "@/lib/content/schema";
import { getUserProgress } from "@/lib/progress";
import { requireUser } from "@/lib/session";
import { AudioPlayer } from "@/components/AudioPlayer";
import { Markdown } from "@/components/Markdown";
import { Mermaid } from "@/components/Mermaid";
import { Badge } from "@/components/ui";
import { VideoList } from "@/components/VideoList";
import { MarkCompleteButton } from "@/components/MarkCompleteButton";
import type { RevealQuestion } from "@/types/client";
import { ModuleQuiz } from "./ModuleQuiz";
import { MarkProgressOnView } from "./MarkProgressOnView";

export const dynamic = "force-dynamic";

export default async function ModulePage({
  params,
}: {
  params: Promise<{ domain: string; module: string }>;
}) {
  const { domain, module: moduleId } = await params;
  if (!DOMAIN_IDS.includes(domain as DomainId)) notFound();
  const domainId = domain as DomainId;

  const m = getModule(moduleId);
  if (!m || m.domainId !== domainId) notFound();

  const user = await requireUser();
  const progress = await getUserProgress(user.id);
  const initialStatus = progress.moduleStatusById[m.id] ?? "todo";

  const d = getDomain(domainId);
  // AUDIO_BUCKET unset/empty = audio feature hidden (see .env.example) — the
  // route 503s without it, so don't render the player on manifest presence alone.
  const audio = process.env.AUDIO_BUCKET ? getModuleAudio(m.id) : null;

  // Prev/Next within the ordered domain module list.
  const siblings = getModules(domainId);
  const idx = siblings.findIndex((s) => s.id === m.id);
  const prev = idx > 0 ? siblings[idx - 1] : null;
  const next = idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : null;

  // Quiz: send answer keys to the client for instant, low-stakes feedback.
  const quiz = getQuizByModule(m.id);
  const revealQuestions: RevealQuestion[] = quiz
    ? getQuestions(quiz.questionIds).map((q) => toRevealQuestion(q, { seed: user.id }))
    : [];

  return (
    <div>
      <MarkProgressOnView moduleId={m.id} initialStatus={initialStatus} />
      <Link
        href={`/learn/${domainId}`}
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-foreground"
      >
        <ChevronLeft size={16} /> {d.shortTitle}
      </Link>

      <article className="max-w-3xl">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold">{m.title}</h1>
          <div className="mt-1.5 flex items-center gap-3 text-xs text-muted">
            <span className="inline-flex items-center gap-1">
              <Clock size={13} /> {m.estMinutes} min
            </span>
            <Badge tone="neutral">Module {m.order}</Badge>
          </div>
          <div className="mt-4">
            <MarkCompleteButton moduleId={m.id} initialStatus={initialStatus} />
          </div>
        </header>

        {audio ? (
          <AudioPlayer
            src={`/api/audio/${m.id}`}
            moduleId={m.id}
            estDurationSec={audio.estDurationSec}
            bodyId="module-body"
            segments={audio.segments}
          />
        ) : null}

        <Markdown id="module-body">{m.bodyMarkdown}</Markdown>

        {m.diagrams.length > 0 ? (
          <div className="mt-8 space-y-6">
            {m.diagrams.map((diagram, i) => (
              <figure key={i}>
                <figcaption className="mb-2 text-sm font-semibold">
                  {diagram.title}
                </figcaption>
                <Mermaid chart={diagram.mermaid} />
              </figure>
            ))}
          </div>
        ) : null}

        {(() => {
          const videos = getModuleVideos(m.id);
          return videos.length ? (
            <section className="mt-10 border-t border-line pt-8">
              <h2 className="mb-1 text-xl font-semibold">Recommended videos</h2>
              <p className="mb-5 text-sm text-muted">
                Hand-picked walkthroughs to reinforce this module.
              </p>
              <VideoList videos={videos} />
            </section>
          ) : null;
        })()}

        {quiz && revealQuestions.length > 0 ? (
          <section className="mt-10 border-t border-line pt-8">
            <h2 className="mb-1 text-xl font-semibold">Check your understanding</h2>
            <p className="mb-5 text-sm text-muted">
              Answer each question, then finish to record your score and complete
              the module.
            </p>
            <ModuleQuiz
              quizId={quiz.id}
              moduleId={m.id}
              domainId={domainId}
              questions={revealQuestions}
            />
          </section>
        ) : null}

        {/* Prev / Next module navigation */}
        <nav className="mt-10 flex items-center justify-between gap-3 border-t border-line pt-5">
          {prev ? (
            <Link
              href={`/learn/${domainId}/${prev.id}`}
              className="group inline-flex max-w-[45%] flex-col rounded-lg border border-line px-4 py-2 text-sm hover:bg-surface-2"
            >
              <span className="inline-flex items-center gap-1 text-xs text-muted">
                <ArrowLeft size={13} /> Previous
              </span>
              <span className="truncate font-medium">{prev.title}</span>
            </Link>
          ) : (
            <span />
          )}
          {next ? (
            <Link
              href={`/learn/${domainId}/${next.id}`}
              className="group inline-flex max-w-[45%] flex-col rounded-lg border border-line px-4 py-2 text-right text-sm hover:bg-surface-2"
            >
              <span className="inline-flex items-center justify-end gap-1 text-xs text-muted">
                Next <ArrowRight size={13} />
              </span>
              <span className="truncate font-medium">{next.title}</span>
            </Link>
          ) : (
            <span />
          )}
        </nav>
      </article>
    </div>
  );
}
