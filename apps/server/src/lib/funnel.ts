import { metrics } from "@opentelemetry/api";

// The merchant funnel, counted as one OpenTelemetry counter that goes to
// GitLab Observability with the traces (telemetry.ts). Only the step is
// recorded: no user id, email or tool argument. Without a registered meter
// provider (tests, local runs) the counter is a no-op.
const FUNNEL_STEPS = [
  "connect",
  "idea",
  "set_approved",
  "ad_approved",
  "campaign_created",
  "autopilot_run",
] as const;
export type FunnelStep = (typeof FUNNEL_STEPS)[number];

export const FUNNEL_METRIC = "wovain.funnel.events";

// Which tool call marks a step, from its MCP name and arguments:
// - idea: a new design drafted from the merchant's idea (no id yet)
// - set_approved: the merchant approved a design, so publish_design runs
// - ad_approved: the merchant added an ad widget to the campaign
// - campaign_created: the campaign widget shows a built campaign
// - autopilot_run: the five automated rules were put on the campaign
export const stepOf = (
  tool: string,
  args: Record<string, unknown>
): FunnelStep | undefined => {
  switch (tool) {
    case "show_design_widget": {
      return args["id"] === undefined ? "idea" : undefined;
    }
    case "publish_design": {
      return "set_approved";
    }
    case "record_ad": {
      return args["status"] === "added" ? "ad_approved" : undefined;
    }
    case "show_campaign_widget": {
      return args["status"] === "ready" || args["status"] === "live"
        ? "campaign_created"
        : undefined;
    }
    case "create_rules": {
      return "autopilot_run";
    }
    default: {
      return undefined;
    }
  }
};

// The meter is looked up on each count, since the provider registers after
// the modules load (index.ts).
export const countStep = (step: FunnelStep) => {
  metrics
    .getMeter("wovain-funnel")
    .createCounter(FUNNEL_METRIC, {
      description: "Merchant funnel steps reached",
    })
    .add(1, { "wovain.funnel.step": step });
};
