import type { Domain, DomainId } from "./schema";

// Verified against the official PCA exam guide v6.1 (June 2026). Weights ARE
// published in this revision and sum to 100%.
export const DOMAINS: Domain[] = [
  {
    id: "design-plan",
    index: 1,
    title: "Designing and planning a cloud solution architecture",
    shortTitle: "Design & Planning",
    weightPct: 25,
    blurb:
      "Translate business and technical requirements into a resilient, cost-effective Google Cloud architecture — choosing the right network, storage, and compute, and planning migrations.",
    subObjectives: [
      "Designing for business requirements (continuity, cost, integration, KPIs/ROI)",
      "Designing for technical requirements (HA/failover, scalability, performance, backup/recovery)",
      "Designing network, storage, and compute resources",
      "Creating a migration plan",
      "Envisioning future solution improvements (cloud-first)",
    ],
    pillars: ["reliability", "cost", "performance", "operational-excellence"],
  },
  {
    id: "provision",
    index: 2,
    title: "Managing and provisioning a cloud solution infrastructure",
    shortTitle: "Provisioning",
    weightPct: 17.5,
    blurb:
      "Stand up and operate network topologies, storage systems, and compute — including hybrid/multicloud connectivity and the Gemini Enterprise Agent Platform for ML workflows.",
    subObjectives: [
      "Configuring network topologies (hybrid, multicloud, VPC, load balancing)",
      "Configuring individual storage systems (lifecycle, retention, protection)",
      "Configuring compute systems (Compute Engine, GKE, serverless, VMware Engine)",
      "Leveraging Gemini Enterprise Agent Platform for end-to-end ML workflows",
      "Configuring prebuilt solutions or APIs with Agent Platform",
    ],
    pillars: ["reliability", "performance", "operational-excellence"],
  },
  {
    id: "security",
    index: 3,
    title: "Designing for security and compliance",
    shortTitle: "Security & Compliance",
    weightPct: 17.5,
    blurb:
      "Apply IAM, the resource hierarchy, data protection, and security controls; meet regulatory and compliance obligations including securing AI workloads.",
    subObjectives: [
      "Designing for security (IAM, resource hierarchy, KMS/CMEK, VPC-SC, IAP, WIF)",
      "Securing the software supply chain and AI (Model Armor, Sensitive Data Protection)",
      "Designing for compliance (HIPAA, data sovereignty, PII/PCI, SOC 2, audits)",
    ],
    pillars: ["security", "operational-excellence"],
  },
  {
    id: "optimize-process",
    index: 4,
    title: "Analyzing and optimizing technical and business processes",
    shortTitle: "Process Optimization",
    weightPct: 15,
    blurb:
      "Define and improve SDLC/CI-CD, testing, disaster recovery, and business processes — change management, stakeholder alignment, and cost/resource optimization.",
    subObjectives: [
      "Analyzing and defining technical processes (SDLC, CI/CD, RCA, DR)",
      "Analyzing and defining business processes (change mgmt, cost/resource optimization, BC)",
    ],
    pillars: ["cost", "reliability", "operational-excellence"],
  },
  {
    id: "manage-impl",
    index: 5,
    title: "Managing implementation",
    shortTitle: "Implementation",
    weightPct: 12.5,
    blurb:
      "Advise dev and ops teams on deployment, API management, and testing; interact with Google Cloud programmatically via SDKs, IaC/Terraform, and client libraries.",
    subObjectives: [
      "Advising development and operation teams to ensure successful deployment",
      "Interacting with Google Cloud programmatically (gcloud, IaC, emulators, client libs)",
    ],
    pillars: ["operational-excellence"],
  },
  {
    id: "ops-excellence",
    index: 6,
    title: "Ensuring solution and operations excellence",
    shortTitle: "Operations Excellence",
    weightPct: 12.5,
    blurb:
      "Operate reliably in production: observability, alerting, release management, quality control, and reliability practices (SLOs, chaos engineering, load testing).",
    subObjectives: [
      "Operational excellence pillar of the Well-Architected Framework",
      "Google Cloud Observability (monitoring, logging, profiling, alerting)",
      "Deployment and release management; supporting deployed solutions",
      "Quality control and ensuring reliability in production",
    ],
    pillars: ["operational-excellence", "reliability"],
  },
];

export const DOMAIN_BY_ID: Record<DomainId, Domain> = Object.fromEntries(
  DOMAINS.map((d) => [d.id, d]),
) as Record<DomainId, Domain>;

export function getDomain(id: DomainId): Domain {
  return DOMAIN_BY_ID[id];
}
