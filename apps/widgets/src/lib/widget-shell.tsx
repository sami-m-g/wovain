import type { App } from "@modelcontextprotocol/ext-apps/react";
import type { ReactElement } from "react";

import type { WidgetState } from "./bridge.ts";

// Renders the connect error and the loading line every widget shares; the
// widget itself only draws once the host has handed it its tool result.
export const WidgetShell = <T,>({
  children,
  loading,
  name,
  widget,
}: {
  children: (ready: { app: App; data: T }) => ReactElement;
  loading: string;
  name: string;
  widget: WidgetState<T>;
}) => {
  if (widget.state === "error") {
    return (
      <p className="text-danger p-4 text-sm" role="alert">
        {`The ${name} widget couldn’t connect. Ask again to reload it.`}
      </p>
    );
  }
  if (widget.state === "loading") {
    return <p className="text-secondary p-4 text-sm">{loading}</p>;
  }
  return children({ app: widget.app, data: widget.data });
};

// What a view shows when a button's action failed. Fixed text on purpose:
// the exception can name tools or upstream services.
export const ActionError = ({ failed }: { failed: boolean }) =>
  failed ? (
    <p className="text-danger mt-3 text-sm" role="alert">
      That didn’t go through. Try again.
    </p>
  ) : null;
