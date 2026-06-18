// Deterministic, LLM-free pattern detection over a user's recent answers.
// Pure functions only — safe to run anywhere (no DB, no network, no server-only).

export interface RuleInsight {
  kind: "pattern" | "tip" | "strength";
  concepts: string[];
  message: string;
}

export interface AnswerLike {
  questionId: string;
  domainId: string;
  concepts: string[];
  correct: boolean;
}

/**
 * Curated, exam-accurate coaching tips keyed by concept slug. When a weak
 * concept matches a key here, we surface the targeted tip in addition to the
 * generic "you're missing X" pattern. Keys are GCP concept slugs as tagged on
 * questions (Question.concepts).
 */
export const CONCEPT_TIPS: Record<string, string> = {
  "spanner-vs-bigtable":
    "Cloud Spanner is a relational, strongly-consistent SQL database that scales horizontally — reach for it when you need transactions and joins at global scale. Cloud Bigtable is wide-column NoSQL built for very high-throughput analytical and time-series workloads. Do NOT use Bigtable for relational/transactional needs.",
  "gke-vs-cloudrun":
    "Cloud Run = serverless containers: request-driven, scales to zero, minimal ops. GKE = full Kubernetes control: long-running daemons, custom networking/operators, and fine-grained scheduling. Default to Cloud Run unless you specifically need what Kubernetes gives you.",
  cmek:
    "CMEK = Customer-Managed Encryption Keys held in Cloud KMS that you control (rotation, disable, destroy), versus Google-managed default encryption (automatic, no control) and CSEK (you supply raw key material, no KMS). Choose CMEK when compliance requires customer control over the key lifecycle.",
  "vpc-service-controls":
    "VPC Service Controls create security perimeters around API-based managed services (GCS, BigQuery, etc.) to prevent data exfiltration. It is NOT a firewall — firewall rules control L3/L4 network traffic; VPC-SC controls service-API access across the perimeter.",
  "rto-rpo":
    "RTO = how long until service is restored; RPO = how much data loss is acceptable. Map them to a DR pattern: lax RTO/RPO → backup & restore; tighter → warm standby; near-zero → multi-region active/active. Don't over-provision DR beyond what RTO/RPO require.",
  "slo-sli":
    "SLI = the measured signal (e.g. request success rate), SLO = the target for that signal (e.g. 99.9%), and the error budget = 1 − SLO. Spend the error budget to balance reliability against feature velocity; alert on burn rate, not raw errors.",
  iap:
    "Identity-Aware Proxy (IAP) provides context-aware access to apps and VMs based on identity and request context — no VPN or bastion host required. Use it to enforce least-privilege, zero-trust access to internal web apps and SSH/RDP.",
  "workload-identity-federation":
    "Workload Identity Federation lets external workloads (other clouds, on-prem, CI/CD) impersonate a service account using their own identity provider — eliminating long-lived exported SA keys. Prefer it over downloading and distributing service-account JSON keys.",
  "committed-use-discounts":
    "Committed Use Discounts (CUDs) reward steady-state, predictable usage with deep discounts for a 1- or 3-year commitment. Use Spot VMs for fault-tolerant, interruptible batch work, and on-demand for spiky/unpredictable load. Match the pricing model to the workload's predictability.",
  // A handful more high-frequency PCA confusions.
  "load-balancer-selection":
    "Pick the load balancer by traffic type and scope: global external Application LB for HTTP(S) with global anycast; regional external for regional HTTP(S); Network (passthrough) LB for TCP/UDP/L4; internal LB for VPC-internal traffic. Don't put L4 traffic behind an L7 LB.",
  "storage-class-selection":
    "Match Cloud Storage class to access frequency: Standard (hot/frequent), Nearline (~monthly), Coldline (~quarterly), Archive (rarely, long-term). Use lifecycle rules to auto-transition objects and avoid paying Standard rates for cold data.",
  "iam-roles":
    "Favor predefined roles over basic roles (Owner/Editor/Viewer), and custom roles only when predefined ones are too broad. Grant at the lowest effective level of the resource hierarchy and prefer groups over individual user bindings.",
  "private-google-access":
    "Use Private Google Access / Private Service Connect so resources without external IPs can reach Google APIs over internal routes — keeping traffic off the public internet. Pair with VPC-SC for exfiltration control.",
  "dataflow-vs-dataproc":
    "Dataflow = fully managed, serverless Apache Beam for unified stream + batch with autoscaling. Dataproc = managed Hadoop/Spark, best when you're lifting existing Spark/Hadoop jobs or need cluster-level control. Prefer Dataflow for new streaming pipelines.",
  "pubsub":
    "Pub/Sub is a global, at-least-once messaging service for decoupling producers and consumers. Use it for event ingestion and fan-out; enable dead-letter topics and exactly-once delivery where ordering/duplication matters.",
};

const MAX_PATTERNS = 5;

interface ConceptStat {
  concept: string;
  total: number;
  wrong: number;
  accuracy: number;
}

interface DomainStat {
  domainId: string;
  total: number;
  correct: number;
  accuracy: number;
}

/**
 * Analyze a user's recent answers into deterministic insights:
 *  - patterns: concepts the user repeatedly misses (total>=2, accuracy<=0.5)
 *  - tips: curated GCP guidance for weak concepts that have a CONCEPT_TIPS entry
 *  - strengths: domains with strong performance (total>=3, accuracy>=0.8)
 */
export function analyzeAnswers(answers: AnswerLike[]): RuleInsight[] {
  if (answers.length === 0) return [];

  // ---- Aggregate per concept --------------------------------------------
  const conceptMap = new Map<string, { total: number; wrong: number }>();
  for (const a of answers) {
    for (const concept of a.concepts ?? []) {
      const entry = conceptMap.get(concept) ?? { total: 0, wrong: 0 };
      entry.total += 1;
      if (!a.correct) entry.wrong += 1;
      conceptMap.set(concept, entry);
    }
  }

  const conceptStats: ConceptStat[] = [...conceptMap.entries()].map(
    ([concept, { total, wrong }]) => ({
      concept,
      total,
      wrong,
      accuracy: total > 0 ? (total - wrong) / total : 0,
    }),
  );

  // Weak concepts drive both patterns and tips.
  const weakConcepts = conceptStats
    .filter((c) => c.total >= 2 && c.accuracy <= 0.5)
    .sort((a, b) => b.wrong - a.wrong || b.total - a.total);

  const insights: RuleInsight[] = [];

  // ---- Patterns ---------------------------------------------------------
  for (const c of weakConcepts.slice(0, MAX_PATTERNS)) {
    insights.push({
      kind: "pattern",
      concepts: [c.concept],
      message: `You're missing most questions tagged \`${c.concept}\` (${c.wrong}/${c.total} wrong). Review the core trade-offs for this topic and re-attempt related practice questions.`,
    });
  }

  // ---- Tips (curated, for any weak concept with an entry) ----------------
  for (const c of weakConcepts) {
    const tip = CONCEPT_TIPS[c.concept];
    if (tip) {
      insights.push({
        kind: "tip",
        concepts: [c.concept],
        message: tip,
      });
    }
  }

  // ---- Strengths (per domain) -------------------------------------------
  const domainMap = new Map<string, { total: number; correct: number }>();
  for (const a of answers) {
    const entry = domainMap.get(a.domainId) ?? { total: 0, correct: 0 };
    entry.total += 1;
    if (a.correct) entry.correct += 1;
    domainMap.set(a.domainId, entry);
  }

  const domainStats: DomainStat[] = [...domainMap.entries()].map(
    ([domainId, { total, correct }]) => ({
      domainId,
      total,
      correct,
      accuracy: total > 0 ? correct / total : 0,
    }),
  );

  for (const d of domainStats
    .filter((d) => d.total >= 3 && d.accuracy >= 0.8)
    .sort((a, b) => b.accuracy - a.accuracy)) {
    insights.push({
      kind: "strength",
      concepts: [],
      message: `Strong area: you're answering ${Math.round(
        d.accuracy * 100,
      )}% correctly in this domain (${d.correct}/${d.total}). Keep this momentum and shift focus to weaker topics.`,
    });
  }

  return insights;
}

/** Concept slugs the user is currently weak on (total>=2, accuracy<=0.5). */
export function weakConceptSlugs(answers: AnswerLike[]): string[] {
  const conceptMap = new Map<string, { total: number; wrong: number }>();
  for (const a of answers) {
    for (const concept of a.concepts ?? []) {
      const entry = conceptMap.get(concept) ?? { total: 0, wrong: 0 };
      entry.total += 1;
      if (!a.correct) entry.wrong += 1;
      conceptMap.set(concept, entry);
    }
  }
  return [...conceptMap.entries()]
    .filter(([, { total, wrong }]) => total >= 2 && (total - wrong) / total <= 0.5)
    .sort((a, b) => b[1].wrong - a[1].wrong)
    .map(([concept]) => concept);
}
