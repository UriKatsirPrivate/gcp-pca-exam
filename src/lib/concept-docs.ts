// Curated concept -> official GCP documentation links, surfaced as "Learn more"
// on revealed questions (quizzes, drill, post-exam review). Keyed by the same
// concept slugs used on questions (`Question.concepts`) and in CONCEPT_TIPS.
//
// Client-safe (no server-only imports). These point at stable product/landing
// doc pages on cloud.google.com — spot-check periodically as docs are reorganized.
// Per-question provenance lives on each question (`sourceUrl`, `lastVerified`);
// this map covers the high-frequency concepts as a fallback "Learn more" list.

export interface ConceptDoc {
  label: string;
  url: string;
}

export const CONCEPT_DOCS: Record<string, ConceptDoc> = {
  "spanner-vs-bigtable": { label: "Cloud Spanner docs", url: "https://cloud.google.com/spanner/docs" },
  "gke-vs-cloudrun": { label: "Cloud Run docs", url: "https://cloud.google.com/run/docs" },
  cmek: { label: "Customer-managed encryption keys (CMEK)", url: "https://cloud.google.com/kms/docs/cmek" },
  "vpc-service-controls": { label: "VPC Service Controls docs", url: "https://cloud.google.com/vpc-service-controls/docs" },
  "rto-rpo": { label: "DR planning guide", url: "https://cloud.google.com/architecture/dr-scenarios-planning-guide" },
  "disaster-recovery": { label: "DR building blocks", url: "https://cloud.google.com/architecture/dr-scenarios-building-blocks" },
  "slo-sli": { label: "SLO monitoring", url: "https://cloud.google.com/stackdriver/docs/solutions/slo-monitoring" },
  iap: { label: "Identity-Aware Proxy docs", url: "https://cloud.google.com/iap/docs" },
  "workload-identity-federation": { label: "Workload Identity Federation", url: "https://cloud.google.com/iam/docs/workload-identity-federation" },
  "committed-use-discounts": { label: "Committed use discounts", url: "https://cloud.google.com/compute/docs/instances/committed-use-discounts-overview" },
  "load-balancing": { label: "Choosing a load balancer", url: "https://cloud.google.com/load-balancing/docs/choosing-load-balancer" },
  "storage-selection": { label: "Cloud Storage classes", url: "https://cloud.google.com/storage/docs/storage-classes" },
  "storage-classes": { label: "Cloud Storage classes", url: "https://cloud.google.com/storage/docs/storage-classes" },
  "iam-roles": { label: "Understanding IAM roles", url: "https://cloud.google.com/iam/docs/understanding-roles" },
  iam: { label: "IAM overview", url: "https://cloud.google.com/iam/docs/overview" },
  "private-google-access": { label: "Private Google Access", url: "https://cloud.google.com/vpc/docs/private-google-access" },
  "private-service-connect": { label: "Private Service Connect", url: "https://cloud.google.com/vpc/docs/private-service-connect" },
  "vpc-design": { label: "VPC design best practices", url: "https://cloud.google.com/architecture/best-practices-vpc-design" },
  "kms-cmek": { label: "Customer-managed encryption keys (CMEK)", url: "https://cloud.google.com/kms/docs/cmek" },
  "sensitive-data-protection": { label: "Sensitive Data Protection", url: "https://cloud.google.com/sensitive-data-protection/docs" },
  "ci-cd": { label: "CI/CD on Google Cloud", url: "https://cloud.google.com/docs/ci-cd" },
  rightsizing: { label: "Active Assist Recommender", url: "https://cloud.google.com/recommender/docs" },
  "cost-resource-optimization": { label: "Cost optimization (Architecture Framework)", url: "https://cloud.google.com/architecture/framework/cost-optimization" },
  "cost-optimization": { label: "Cost optimization (Architecture Framework)", url: "https://cloud.google.com/architecture/framework/cost-optimization" },
  "backup-recovery": { label: "Backup and DR", url: "https://cloud.google.com/backup-disaster-recovery/docs" },
};

/** Doc links for a question's concepts, in concept order, deduped. */
export function docsForConcepts(concepts: string[]): ConceptDoc[] {
  const seen = new Set<string>();
  const out: ConceptDoc[] = [];
  for (const c of concepts) {
    const doc = CONCEPT_DOCS[c];
    if (doc && !seen.has(doc.url)) {
      seen.add(doc.url);
      out.push(doc);
    }
  }
  return out;
}
