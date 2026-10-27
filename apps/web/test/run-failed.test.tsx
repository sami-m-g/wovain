import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { NoIdeasState, RunFailedState } from "@/components/app/run-failed";
import { describeRunFailure } from "@/lib/flow-client";

import messages from "../messages/en.json";

vi.mock("@/i18n/navigation", () => ({
  Link: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const render = (node: React.ReactNode) =>
  renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      {node}
    </NextIntlClientProvider>
  );

const noop = () => {};

describe("describeRunFailure", () => {
  it("reads a typed not-connected error", () => {
    expect(describeRunFailure({ error: "FAL_NOT_CONNECTED" })).toEqual({
      reason: "not_connected",
      service: "fal",
    });
    expect(describeRunFailure({ error: "Fourthwall isn't connected" })).toEqual(
      { reason: "not_connected", service: "fourthwall" }
    );
    expect(
      describeRunFailure({ error: "Connect your fal account to draw designs" })
    ).toEqual({ reason: "not_connected", service: "fal" });
  });

  it("recognises empty research and autopilot rejections", () => {
    expect(
      describeRunFailure({ error: "Research found no ideas for this seed." })
    ).toEqual({ reason: "no_ideas" });
    expect(
      describeRunFailure({ error: "Autopilot rejected the design: bland" })
    ).toEqual({ reason: "rejected" });
  });

  it("keeps the message of anything else", () => {
    expect(describeRunFailure({ error: "boom" })).toEqual({
      message: "boom",
      reason: "other",
    });
    expect(describeRunFailure({ error: null })).toEqual({
      message: "",
      reason: "other",
    });
  });
});

describe("RunFailedState", () => {
  it("names the failed step and offers Connect for a missing connection", () => {
    const html = render(
      <RunFailedState
        failure={{ reason: "not_connected", service: "fal" }}
        onRestart={noop}
        onRetry={noop}
        retrying={false}
        stage="designs"
      />
    );
    expect(html).toContain("The drop stopped during Designs");
    expect(html).toContain("fal isn&#x27;t connected");
    expect(html).toContain("Connect fal");
    expect(html).toContain('href="/dashboard/connections"');
    expect(html).toContain("Try again");
  });

  it("explains an unknown failure and offers Try again, without Connect", () => {
    const html = render(
      <RunFailedState
        failure={{ message: "upstream 502", reason: "other" }}
        onRestart={noop}
        onRetry={noop}
        retrying={false}
        stage="trends"
      />
    );
    expect(html).toContain("The drop stopped during Trends");
    expect(html).toContain("Something went wrong on our side");
    expect(html).toContain("upstream 502");
    expect(html).toContain("Try again");
    expect(html).not.toContain("Connect ");
  });

  it("disables the actions while a new run is starting", () => {
    const html = render(
      <RunFailedState
        failure={{ reason: "no_ideas" }}
        onRestart={noop}
        onRetry={noop}
        retrying
        stage="trends"
      />
    );
    expect(html).toContain("Starting again");
    expect(html).not.toContain("Pick the ideas");
  });
});

describe("NoIdeasState", () => {
  it("shows an empty state, not an empty step, when research finds nothing", () => {
    const html = render(
      <NoIdeasState onRestart={noop} onRetry={noop} retrying={false} />
    );
    expect(html).toContain('data-slot="empty"');
    expect(html).toContain("No ideas this time");
    expect(html).toContain("Try again");
    expect(html).toContain("Write a new brief");
    expect(html).not.toContain("Pick the ideas");
  });
});
