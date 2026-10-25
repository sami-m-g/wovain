import { useApp } from "@modelcontextprotocol/ext-apps/react";
import type {
  App,
  McpUiHostContext,
} from "@modelcontextprotocol/ext-apps/react";
import { StrictMode, useState } from "react";
import type { ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { z } from "zod";

// Connects a widget to ChatGPT through the MCP Apps bridge: the widget draws
// once the host hands it the tool result it was opened with, checked with zod
// (tool results are data from the merchant's account and the web).

const applyTheme = (context: Partial<McpUiHostContext> | undefined) => {
  if (context?.theme !== undefined) {
    document.documentElement.classList.toggle("dark", context.theme === "dark");
  }
};

type WidgetState<T> =
  | { state: "error" }
  | { state: "loading" }
  | { app: App; data: T; state: "ready" };

const useWidget = <T,>(name: string, schema: z.ZodType<T>): WidgetState<T> => {
  const [data, setData] = useState<T | undefined>();
  const [invalid, setInvalid] = useState(false);
  const { app, error } = useApp({
    appInfo: { name: `wovain-${name}`, version: "0.1.0" },
    capabilities: {},
    // Listeners exist before connect, or the first tool result is missed.
    onAppCreated: (created) => {
      created.addEventListener("toolresult", (result) => {
        const parsed = z
          .object({ result: schema })
          .safeParse(result.structuredContent);
        setInvalid(!parsed.success);
        if (parsed.success) {
          setData(parsed.data.result);
        }
      });
      created.addEventListener("hostcontextchanged", applyTheme);
      applyTheme(created.getHostContext());
    },
  });
  if (error !== null || invalid) {
    return { state: "error" };
  }
  return app === null || data === undefined
    ? { state: "loading" }
    : { app, data, state: "ready" };
};

// Calls a wovain tool from a button; the result's data, or a thrown error.
export const callTool = async <T,>(
  app: App,
  schema: z.ZodType<T>,
  name: string,
  args: Record<string, unknown>
) => {
  const result = await app.callServerTool({ arguments: args, name });
  const parsed = z
    .object({ result: schema })
    .safeParse(result.structuredContent);
  if (result.isError === true || !parsed.success) {
    throw new Error(`${name} failed`);
  }
  return parsed.data.result;
};

// Asks ChatGPT to take the next step, so its own widget shows the result.
export const say = async (app: App, text: string) => {
  await app.sendMessage({ content: [{ text, type: "text" }], role: "user" });
};

const Shell = <T,>({
  name,
  render,
  schema,
}: {
  name: string;
  render: (ready: { app: App; data: T }) => ReactElement;
  schema: z.ZodType<T>;
}) => {
  const widget = useWidget(name, schema);
  if (widget.state === "error") {
    return (
      <p className="text-destructive p-4 text-sm" role="alert">
        This view couldn’t load. Ask again to reload it.
      </p>
    );
  }
  if (widget.state === "loading") {
    return <p className="text-muted-foreground p-4 text-sm">Loading…</p>;
  }
  return render(widget);
};

export const mount = <T,>(
  name: string,
  schema: z.ZodType<T>,
  render: (ready: { app: App; data: T }) => ReactElement
) => {
  const root = document.querySelector("#root");
  if (root !== null) {
    createRoot(root).render(
      <StrictMode>
        <Shell name={name} render={render} schema={schema} />
      </StrictMode>
    );
  }
};

// Runs a button's action, tracking which one is busy and whether it failed.
export const useAction = () => {
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const run = async (kind: string, action: () => Promise<void>) => {
    setBusy(kind);
    setFailed(false);
    try {
      await action();
    } catch {
      setFailed(true);
    }
    setBusy(null);
  };
  return { busy, failed, run };
};

export const ActionError = ({ failed }: { failed: boolean }) =>
  failed ? (
    <p className="text-destructive mt-2 text-xs" role="alert">
      That didn’t go through. Try again.
    </p>
  ) : null;
