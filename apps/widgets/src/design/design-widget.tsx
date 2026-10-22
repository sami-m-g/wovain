import type { App } from "@modelcontextprotocol/ext-apps/react";
import { designResultSchema } from "@wovain/shared/design";
import type { Design } from "@wovain/shared/design";
import { defaultSettings, settingsResultSchema } from "@wovain/shared/settings";
import { useEffect, useState } from "react";
import { z } from "zod";

import {
  callTool,
  readWidgetState,
  say,
  useWidget,
  writeWidgetState,
} from "../lib/bridge.ts";
import { WidgetShell } from "../lib/widget-shell.tsx";
import { DesignWidgetView } from "./design-widget-view.tsx";
import type { DesignWidgetActions } from "./design-widget-view.tsx";
import type { PricingValues } from "./pricing-settings.tsx";

const widgetSchema = z.object({ feedback: z.string() });

// Widget buttons can only call wovain, so Fourthwall steps go through the chat:
// the widget posts a short message and the design playbook does the rest.
const actionsFor = (app: App): DesignWidgetActions => ({
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
    // wovain reprices every product of the drop with the new settings.
    const { design: saved } = await callTool(
      app,
      designResultSchema,
      "show_design_widget",
      { ...design, status: undefined }
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

// Loads the merchant's pricing settings once the host has connected.
const DesignReady = ({ app, design }: { app: App; design: Design }) => {
  const [pricing, setPricing] = useState<PricingValues>(
    () => defaultSettings().pricing
  );

  useEffect(() => {
    const load = async () => {
      const { settings } = await callTool(
        app,
        settingsResultSchema,
        "get_settings",
        {}
      );
      setPricing(settings.pricing);
    };
    void load();
  }, [app]);

  return (
    <DesignWidgetView
      design={design}
      initialFeedback={readWidgetState(widgetSchema)?.feedback}
      onFeedbackDraft={(feedback) => {
        writeWidgetState({ feedback });
      }}
      pricing={pricing}
      {...actionsFor(app)}
    />
  );
};

export const DesignWidget = () => {
  const widget = useWidget("design", designResultSchema);
  return (
    <WidgetShell loading="Laying out the design…" name="design" widget={widget}>
      {({ app, data }) => <DesignReady app={app} design={data.design} />}
    </WidgetShell>
  );
};
