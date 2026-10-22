import {
  AppBridge,
  McpUiToolResultNotificationSchema,
  PostMessageTransport,
} from "@modelcontextprotocol/ext-apps/app-bridge";

// A minimal MCP Apps host for the proof screenshots: it loads one built
// widget in an iframe, hands it the step's real tool input and result, and
// answers the widget's own tool calls from the journey's recorded replies.
const toolResult = McpUiToolResultNotificationSchema.shape.params;

declare global {
  interface Window {
    proof: {
      html: string;
      input: Record<string, unknown>;
      replies: Record<string, unknown>;
      result: unknown;
      theme: "dark" | "light";
    };
    proofReady?: boolean;
  }
}

const { html, input, replies, result, theme } = window.proof;

const frame = document.createElement("iframe");
frame.title = "widget";
frame.style.cssText = "border:0;width:100%;height:200px;display:block";
document.body.append(frame);

const bridge = new AppBridge(
  null,
  { name: "wovain-proof", version: "0" },
  { openLinks: {}, serverTools: {} },
  { hostContext: { displayMode: "inline", platform: "web", theme } }
);
bridge.oncalltool = async ({ name }) =>
  await Promise.resolve(
    toolResult.safeParse(replies[name]).data ?? {
      content: [{ text: `${name} isn't recorded`, type: "text" }],
      isError: true,
    }
  );
bridge.addEventListener("sizechange", ({ height }) => {
  if (height !== undefined) {
    frame.style.height = `${height}px`;
  }
});
const send = async () => {
  await bridge.sendToolInput({ arguments: input });
  await bridge.sendToolResult(toolResult.parse(result));
  window.proofReady = true;
};
bridge.addEventListener("initialized", () => {
  void send();
});

frame.srcdoc = html;
frame.addEventListener("load", () => {
  const view = frame.contentWindow;
  if (view !== null) {
    void bridge.connect(new PostMessageTransport(view, view));
  }
});
