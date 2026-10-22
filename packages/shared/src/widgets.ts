// The widgets wovain serves: apps/widgets builds one HTML file per name and
// apps/server registers each as a ui:// resource.
export const widgetNames = [
  "settings",
  "design",
  "ad",
  "campaign",
  "dashboard",
] as const;
export type WidgetName = (typeof widgetNames)[number];
