import {
  Cloud,
  ClipboardCheck,
  CalendarRange,
  BookOpen,
  Brain,
  LineChart,
  Timer,
  ArrowRight,
} from "lucide-react";
import { ButtonLink } from "@/components/ui";
import { getCurrentUser } from "@/lib/session";
import { DOMAINS } from "@/lib/content/domains";

const FEATURES = [
  { icon: ClipboardCheck, title: "Diagnostic assessment", body: "An 18-question diagnostic across all six domains scores your proficiency per domain." },
  { icon: CalendarRange, title: "Tailored study plan", body: "A time-bound plan that front-loads your weakest, highest-weight domains." },
  { icon: BookOpen, title: "Visual modules", body: "Concise modules with Mermaid architecture diagrams for every domain." },
  { icon: Brain, title: "Intelligent feedback", body: "Claude analyzes your mistakes to spot patterns and give targeted tips." },
  { icon: LineChart, title: "Progress & focus", body: "A dashboard that tracks mastery and tells you what to study next." },
  { icon: Timer, title: "Full-length exam", body: "A 50–60 question, 2-hour simulation with split-screen case studies." },
];

export default async function HomePage() {
  const user = await getCurrentUser();

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Cloud className="text-brand-600" size={26} />
          <span className="text-lg font-semibold">PCA Prep</span>
        </div>
        <nav className="flex items-center gap-2">
          {user ? (
            <ButtonLink href="/dashboard">Go to dashboard</ButtonLink>
          ) : (
            <>
              <ButtonLink href="/login">Sign in with Google</ButtonLink>
            </>
          )}
        </nav>
      </header>

      <section className="py-16 text-center sm:py-24">
        <p className="mb-3 text-sm font-medium text-brand-600">
          Google Cloud · Professional Cloud Architect
        </p>
        <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">
          Pass the PCA exam with a plan built around your weak spots.
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-muted">
          Aligned to the official v6.1 exam guide and Well-Architected Framework.
          Diagnose, study with visual modules, and simulate the real 2-hour exam.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <ButtonLink href={user ? "/assessment" : "/login"} size="lg">
            {user ? "Take the diagnostic" : "Sign in with Google"} <ArrowRight size={18} />
          </ButtonLink>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f) => (
          <div key={f.title} className="rounded-xl border border-line bg-surface p-5">
            <f.icon className="mb-3 text-brand-600" size={22} />
            <h3 className="font-semibold">{f.title}</h3>
            <p className="mt-1 text-sm text-muted">{f.body}</p>
          </div>
        ))}
      </section>

      <section className="mt-14 pb-6">
        <h2 className="mb-4 text-center text-sm font-semibold uppercase tracking-wide text-muted">
          Six exam domains · official weights
        </h2>
        <div className="flex flex-wrap justify-center gap-2">
          {DOMAINS.map((d) => (
            <span
              key={d.id}
              className="rounded-full border border-line bg-surface px-3 py-1 text-sm"
            >
              {d.shortTitle} <span className="text-muted">· {d.weightPct}%</span>
            </span>
          ))}
        </div>
      </section>
    </main>
  );
}
