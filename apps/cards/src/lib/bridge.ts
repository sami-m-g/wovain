import { useApp } from "@modelcontextprotocol/ext-apps/react";
import type { McpUiHostContext } from "@modelcontextprotocol/ext-apps/react";
import { useEffect, useState } from "react";
import type { z } from "zod";

// ChatGPT-only extensions on top of the MCP Apps bridge. Feature-detect each one.
declare global {
  interface Window {
    openai?: {
      setWidgetState?: (state: unknown) => void;
      widgetState?: unknown;
    };
  }
}

const applyTheme = (context: McpUiHostContext | undefined) => {
  const theme = context?.theme;
  if (theme !== undefined) {
    document.documentElement.dataset["theme"] = theme;
  }
};

// Connects the card to the host and returns the tool result it was opened with,
// checked against the same zod schema the server uses.
export const useCard = <T>(name: string, schema: z.ZodType<T>) => {
  const [data, setData] = useState<T | undefined>();
  const { app, error } = useApp({
    appInfo: { name: `wovain-${name}`, version: "0.1.0" },
    capabilities: {},
    // Listeners must exist before connect or the first tool result is missed;
    // the App lives as long as the card's iframe, so there is nothing to release.
    onAppCreated: (created) => {
      // oxlint-disable-next-line react-doctor/effect-needs-cleanup
      created.addEventListener("toolresult", (result) => {
        const parsed = schema.safeParse(result.structuredContent);
        if (parsed.success) {
          setData(parsed.data);
        }
      });
      created.addEventListener("hostcontextchanged", applyTheme);
    },
  });

  useEffect(() => {
    applyTheme(app?.getHostContext());
  }, [app]);

  return { app, data, error };
};

// Keeps in-progress edits with the message, so a re-render doesn't lose them.
export const readWidgetState = <T>(schema: z.ZodType<T>): T | undefined => {
  const parsed = schema.safeParse(window.openai?.widgetState);
  return parsed.success ? parsed.data : undefined;
};

export const writeWidgetState = (state: unknown) => {
  window.openai?.setWidgetState?.(state);
};
