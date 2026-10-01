import Link from "next/link";
import { ArrowRight, CalendarClock } from "lucide-react";
import { DOMAINS, getDomainTakeaways, getExamTips } from "@/lib/content";
import { requireUser } from "@/lib/session";
import { ExamTips } from "@/components/ExamTips";
import { KeyTakeaways } from "@/components/KeyTakeaways";
import { Badge, Card, CardBody } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ReviewPage() {
  await requireUser();

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <CalendarClock className="text-brand-600" size={24} />
        <div>
          <h1 className="text-2xl font-semibold">One day before the exam</h1>
          <p className="text-sm text-muted">
            Every domain&apos;s key takeaways and exam tips in one place — read
            top to bottom, in exam order.
          </p>
        </div>
      </div>

      <div className="space-y-10">
        {DOMAINS.map((d) => {
          const takeaways = getDomainTakeaways(d.id);
          const examTips = getExamTips(d.id);
          return (
            <section key={d.id}>
              <div className="mb-3 flex flex-wrap items-center gap-3">
                <h2 className="text-lg font-semibold">{d.shortTitle}</h2>
                <Badge tone="brand">{d.weightPct}% of exam</Badge>
                {/* `#top` forces the scroll reset. Leaving this page deep in
                    the scroll lands on a shorter one, where the router sees
                    the new segment's top edge already inside the viewport and
                    skips scrolling (layout-router's topOfElementInViewport
                    early-exit); the hash branch scrolls unconditionally. */}
                <Link
                  href={`/learn/${d.id}#top`}
                  className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground"
                >
                  Modules <ArrowRight size={14} />
                </Link>
              </div>
              {takeaways ? (
                <KeyTakeaways takeaways={takeaways.takeaways} />
              ) : (
                <Card>
                  <CardBody className="text-sm text-muted">
                    No recap authored yet —{" "}
                    <Link
                      href={`/learn/${d.id}`}
                      className="underline hover:text-foreground"
                    >
                      review the modules directly
                    </Link>
                    .
                  </CardBody>
                </Card>
              )}
              <ExamTips domainId={d.id} groups={examTips} />
            </section>
          );
        })}
      </div>
    </div>
  );
}
