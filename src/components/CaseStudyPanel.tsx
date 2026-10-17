import { FileText } from "lucide-react";
import { Markdown } from "@/components/Markdown";
import { cn } from "@/lib/cn";

export type CaseStudyData = {
  name: string;
  sections: {
    overview: string;
    solutionConcept: string;
    existingTech: string;
    businessReqs: string[];
    technicalReqs: string[];
    executiveStatement: string;
  };
};

export function CaseStudyPanel({
  caseStudy,
  scroll,
  footer,
}: {
  caseStudy: CaseStudyData;
  scroll?: boolean;
  footer?: React.ReactNode;
}) {
  const { sections } = caseStudy;
  return (
    <div className="flex h-full flex-col rounded-xl border border-line bg-surface">
      <div className="flex items-center gap-2 border-b border-line p-4">
        <FileText size={18} className="text-brand-600" />
        <h2 className="font-semibold">{caseStudy.name}</h2>
      </div>
      <div className={cn("space-y-5 p-4 text-sm", scroll && "flex-1 overflow-y-auto")}>
        <CaseSection title="Overview">
          <Markdown>{sections.overview}</Markdown>
        </CaseSection>
        <CaseSection title="Solution concept">
          <Markdown>{sections.solutionConcept}</Markdown>
        </CaseSection>
        <CaseSection title="Existing technical environment">
          <Markdown>{sections.existingTech}</Markdown>
        </CaseSection>
        <CaseSection title="Business requirements">
          <ul className="list-disc space-y-1 pl-5">
            {sections.businessReqs.map((req, i) => (
              <li key={i}>{req}</li>
            ))}
          </ul>
        </CaseSection>
        <CaseSection title="Technical requirements">
          <ul className="list-disc space-y-1 pl-5">
            {sections.technicalReqs.map((req, i) => (
              <li key={i}>{req}</li>
            ))}
          </ul>
        </CaseSection>
        <CaseSection title="Executive statement">
          <blockquote className="border-l-2 border-brand-500 pl-4 italic text-muted">
            <Markdown>{sections.executiveStatement}</Markdown>
          </blockquote>
        </CaseSection>
        {footer ? <div className="border-t border-line pt-2">{footer}</div> : null}
      </div>
    </div>
  );
}

function CaseSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
        {title}
      </h3>
      <div className="prose-content text-[15px]">{children}</div>
    </section>
  );
}
