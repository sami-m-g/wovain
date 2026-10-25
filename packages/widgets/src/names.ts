// The widgets wovain serves to ChatGPT: build.ts turns each src/<name>.tsx
// into one self-contained HTML file, and the MCP server registers each as a
// ui:// resource.
export const widgetNames = ["trends", "design", "product", "campaign"] as const;
export type WidgetName = (typeof widgetNames)[number];
