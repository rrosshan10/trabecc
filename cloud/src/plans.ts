// Plan tiers + their enforcement limits.
//
// This is the entire monetization gate. Limits are enforced by the cloud
// API in ingest + query paths. The OSS gateway is unchanged — it pushes
// audit events normally; the cloud decides whether to accept or 402.
//
// All limits are deliberately generous on free so the tier is genuinely
// useful for one developer with one machine. Pro becomes worth $29/mo
// the moment a team adds a second host.

export type Plan = "free" | "pro" | "team" | "enterprise";

export type PlanLimits = {
  /** Max distinct install_ids that can ingest in a 7-day rolling window. */
  maxHosts: number;
  /** Max events accepted per UTC day, across all hosts in the org. */
  maxEventsPerDay: number;
  /** How far back the dashboard / API can query, in days. Older rows hidden. */
  retentionDays: number;
  /** Cap on the windowMinutes query param for /v1/stats etc. */
  maxQueryWindowMinutes: number;
  /** Feature flags. Used by the UI to show/hide premium toggles. */
  features: {
    cloudPolicyPull: boolean;
    anomalyAlerts: boolean;
    teamRbac: boolean;
    sso: boolean;
    policyApproval: boolean;
    onPremExport: boolean;
  };
};

export const PLANS: Record<Plan, PlanLimits> = {
  free: {
    maxHosts: 1,
    maxEventsPerDay: 1_000,
    retentionDays: 7,
    maxQueryWindowMinutes: 60 * 24 * 7, // 7 days
    features: {
      cloudPolicyPull: true,
      anomalyAlerts: false,
      teamRbac: false,
      sso: false,
      policyApproval: false,
      onPremExport: false,
    },
  },
  pro: {
    maxHosts: 5,
    maxEventsPerDay: 100_000,
    retentionDays: 90,
    maxQueryWindowMinutes: 60 * 24 * 90,
    features: {
      cloudPolicyPull: true,
      anomalyAlerts: true,
      teamRbac: false,
      sso: false,
      policyApproval: false,
      onPremExport: false,
    },
  },
  team: {
    maxHosts: 50,
    maxEventsPerDay: 1_000_000,
    retentionDays: 365,
    maxQueryWindowMinutes: 60 * 24 * 365,
    features: {
      cloudPolicyPull: true,
      anomalyAlerts: true,
      teamRbac: true,
      sso: true,
      policyApproval: true,
      onPremExport: false,
    },
  },
  enterprise: {
    maxHosts: 10_000,
    maxEventsPerDay: 100_000_000,
    retentionDays: 3650,
    maxQueryWindowMinutes: 60 * 24 * 3650,
    features: {
      cloudPolicyPull: true,
      anomalyAlerts: true,
      teamRbac: true,
      sso: true,
      policyApproval: true,
      onPremExport: true,
    },
  },
};

/** Stripe Payment Link for the Pro tier — used by 402 responses + UI prompts. */
export const PRO_UPGRADE_URL = "https://buy.stripe.com/fZuaEQ5TqbeU2fC7widUY00";

/** Where to direct Team/Enterprise prospects. */
export const TEAM_UPGRADE_EMAIL = "support.team@trabecc.com";

/** Human-readable upgrade target for a given plan. */
export function nextTierUpgradeUrl(currentPlan: Plan): { url: string; toPlan: Plan } {
  if (currentPlan === "free") return { url: PRO_UPGRADE_URL, toPlan: "pro" };
  if (currentPlan === "pro") return { url: `mailto:${TEAM_UPGRADE_EMAIL}?subject=Trabecc%20Team`, toPlan: "team" };
  if (currentPlan === "team") return { url: `mailto:${TEAM_UPGRADE_EMAIL}?subject=Trabecc%20Enterprise`, toPlan: "enterprise" };
  return { url: `mailto:${TEAM_UPGRADE_EMAIL}`, toPlan: "enterprise" };
}

export function isValidPlan(value: string): value is Plan {
  return value === "free" || value === "pro" || value === "team" || value === "enterprise";
}
