import type { App } from "@modelcontextprotocol/ext-apps/react";
import { designResultSchema, quoteResultSchema } from "@wovain/shared/design";
import type { Design } from "@wovain/shared/design";
import { defaultSettings, settingsResultSchema } from "@wovain/shared/settings";
import { useEffect, useState } from "react";
import { z } from "zod";

import {
  callTool,
  readWidgetState,
  say,
  useCard,
  writeWidgetState,
} from "../lib/bridge.ts";
import { DesignCardView } from "./design-card-view.tsx";
import type { DesignCardActions } from "./design-card-view.tsx";
import type { PricingValues } from "./pricing-settings.tsx";

const widgetSchema = z.object({ feedback: z.string() });

// Card buttons can only call wovain, so Fourthwall steps go through the chat:
// the card posts a short message and the design playbook does the rest.
const actionsFor = (app: App): DesignCardActions => ({
  onApprove: async (design) => {
    await callTool(app, designResultSchema, "record_design", {
      id: design.id,
      status: "publishing",
    });
    await say(app, `Approve design ${design.id}`);
  },
  onFeedback: async (design, feedback) => {
    await say(app, `Feedback on design ${design.id}: ${feedback}`);
  },
  onOpenDesigner: async (design) => {
    await say(app, `Open design ${design.id} in Fourthwall's designer`);
  },
  onOpenLink: async (url) => {
    await app.openLink({ url });
  },
  onReprice: async (design: Design, pricing: PricingValues) => {
    await callTool(app, settingsResultSchema, "update_settings", {
      patch: { pricing },
    });
    const { quote } = await callTool(app, quoteResultSchema, "price_product", {
      sizes: design.sizes.map(({ baseCost, size }) => ({ baseCost, size })),
    });
    const { design: saved } = await callTool(
      app,
      designResultSchema,
      "show_design_card",
      { ...design, quote, status: undefined }
    );
    return saved;
  },
  onSkip: async (design) => {
    const { design: saved } = await callTool(
      app,
      designResultSchema,
      "record_design",
      {
        id: design.id,
        status: "skipped",
      }
    );
    return saved;
  },
  poll: async (design) => {
    const { design: saved } = await callTool(
      app,
      designResultSchema,
      "get_design",
      {
        id: design.id,
      }
    );
    return saved;
  },
});

export const DesignCard = () => {
  const { app, data, error } = useCard("design", designResultSchema);
  const [pricing, setPricing] = useState<PricingValues>(
    () => defaultSettings().pricing
  );

  useEffect(() => {
    const load = async () => {
      if (app !== null) {
        const { settings } = await callTool(
          app,
          settingsResultSchema,
          "get_settings",
          {}
        );
        setPricing(settings.pricing);
      }
    };
    void load();
  }, [app]);

  if (error !== null) {
    return (
      <p className="text-danger p-4 text-sm">
        The design card couldn’t connect. Ask again to reload it.
      </p>
    );
  }
  if (app === null || data === undefined) {
    return <p className="text-secondary p-4 text-sm">Laying out the design…</p>;
  }

  return (
    <DesignCardView
      design={data.design}
      initialFeedback={readWidgetState(widgetSchema)?.feedback}
      onFeedbackDraft={(feedback) => {
        writeWidgetState({ feedback });
      }}
      pricing={pricing}
      {...actionsFor(app)}
    />
  );
};
