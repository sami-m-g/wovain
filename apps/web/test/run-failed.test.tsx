import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { NoIdeasState, RunFailedState } from "@/components/app/run-failed";
import type { Connection, OnboardingReady } from "@/lib/flow-client";
import { connectUrl, describeRunFailure } from "@/lib/flow-client";
import { orpc } from "@/utils/orpc";

import messages from "../messages/en.json";

// The page the run failed on: connecting comes back to it.
const HERE = "/en/dashboard/new?run=r1&step=products";

vi.mock("next/navigation", () => ({
  usePathname: () => "/en/dashboard/new",
  useSearchParams: () => new URLSearchParams("run=r1&step=products"),
}));

const render = (
  node: React.ReactNode,
  seed: (client: QueryClient) => void = () => {}
) => {
  const client = new QueryClient();
  seed(client);
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
        {node}
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
};

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

  it("reads an expired grant as a reconnect", () => {
    expect(
      describeRunFailure({ error: "Reconnect fal: its sign-in expired" })
    ).toEqual({ reason: "not_connected", reconnect: true, service: "fal" });
    expect(describeRunFailure({ error: "META_RECONNECT_NEEDED" })).toEqual({
      reason: "not_connected",
      reconnect: true,
      service: "meta",
    });
  });

  it("recognises empty research and autopilot rejections", () => {
    expect(
      describeRunFailure({ error: "Research found no ideas for this seed." })
    ).toEqual({ reason: "no_ideas" });
    expect(
      describeRunFailure({ error: "Autopilot rejected the design: bland" })
    ).toEqual({ reason: "rejected" });
  });

  it("recognises Qloo matching nothing in the brief", () => {
    expect(
      describeRunFailure({
        error:
          "Qloo found no audience for this brief; try naming a band, film, brand or place",
      })
    ).toEqual({ reason: "qloo_no_match" });
    expect(describeRunFailure({ error: "QLOO_NO_MATCH" })).toEqual({
      reason: "qloo_no_match",
    });
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
  it("asks to connect a missing provider, never as an error", () => {
    const html = render(
      <RunFailedState
        failure={{ reason: "not_connected", service: "fourthwall" }}
        onRestart={noop}
        onRetry={noop}
        retrying={false}
        stage="products"
      />
    );
    expect(html).toContain("Connect Fourthwall to finish this drop");
    expect(html).toContain("during Products because Fourthwall");
    expect(html).toContain(`href="${connectUrl("fourthwall", HERE)}"`);
    expect(html).toContain("Write a new brief");
    expect(html).toContain('data-slot="empty"');
    expect(html).not.toContain('role="alert"');
  });

  it("offers Reconnect when the sign-in expired", () => {
    const html = render(
      <RunFailedState
        failure={{ reason: "not_connected", reconnect: true, service: "meta" }}
        onRestart={noop}
        onRetry={noop}
        retrying={false}
        stage="campaign"
      />
    );
    expect(html).toContain("Reconnect Meta to finish this drop");
    expect(html).toContain("Meta&#x27;s sign-in expired");
    expect(html).toContain(`href="${connectUrl("meta", HERE)}"`);
  });

  it("offers Try again in one click once the provider is connected", () => {
    const html = render(
      <RunFailedState
        failure={{ reason: "not_connected", service: "fourthwall" }}
        onRestart={noop}
        onRetry={noop}
        retrying={false}
        stage="products"
      />,
      (client) => {
        client.setQueryData(orpc.connections.list.queryKey(), [
          {
            connectedAt: new Date(),
            needsReconnect: false,
            provider: "fourthwall",
          },
        ] as unknown as Connection[]);
      }
    );
    expect(html).toContain("Fourthwall is connected");
    expect(html).toContain("Try again");
    expect(html).not.toContain("/api/connections/");
  });

  it("never names fal while wovain draws the art", () => {
    const html = render(
      <RunFailedState
        failure={{ reason: "not_connected", service: "fal" }}
        onRestart={noop}
        onRetry={noop}
        retrying={false}
        stage="designs"
      />,
      (client) => {
        client.setQueryData(orpc.onboarding.status.queryKey(), {
          enabled: true,
          wovainDraws: true,
        } as unknown as OnboardingReady);
      }
    );
    expect(html).toContain("The drop stopped during Designs");
    expect(html).toContain("Try again");
    expect(html).not.toMatch(/\bfal\b/u);
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

  it("suggests a brief Qloo knows, not a retry, when Qloo matched nothing", () => {
    const html = render(
      <RunFailedState
        failure={{ reason: "qloo_no_match" }}
        onRestart={noop}
        onRetry={noop}
        retrying={false}
        stage="trends"
      />
    );
    expect(html).toContain("Qloo found no audience for this brief");
    expect(html).toContain("band, film, brand or place");
    expect(html).toContain('href="/dashboard/new?brief=Studio%20Ghibli"');
    expect(html).toContain("Write a new brief");
    expect(html).not.toContain("Try again");
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
