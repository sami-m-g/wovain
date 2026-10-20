import {
  applyDocumentTheme,
  useApp,
} from "@modelcontextprotocol/ext-apps/react";
import type {
  App,
  McpUiHostContext,
} from "@modelcontextprotocol/ext-apps/react";
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

// Sets data-theme and color-scheme. Host color variables are left out on
// purpose: they share the --color-* names of the UI kit's tokens.
const applyTheme = (context: Partial<McpUiHostContext> | undefined) => {
  if (context?.theme !== undefined) {
    applyDocumentTheme(context.theme);
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

// Calls a wovain tool and checks its result against the shared schema.
export const callTool = async <T>(
  app: App,
  schema: z.ZodType<T>,
  name: string,
  args: Record<string, unknown>
): Promise<T> => {
  const result = await app.callServerTool({ arguments: args, name });
  const parsed = schema.safeParse(result.structuredContent);
  if (result.isError === true || !parsed.success) {
    throw new Error(`${name} failed`);
  }
  return parsed.data;
};

// Posts a chat message as the user, for steps only the skills can take.
export const say = async (app: App, text: string) => {
  await app.sendMessage({ content: [{ text, type: "text" }], role: "user" });
};

// Keeps in-progress edits with the message, so a re-render doesn't lose them.
export const readWidgetState = <T>(schema: z.ZodType<T>): T | undefined => {
  const parsed = schema.safeParse(window.openai?.widgetState);
  return parsed.success ? parsed.data : undefined;
};

export const writeWidgetState = (state: unknown) => {
  window.openai?.setWidgetState?.(state);
};
