import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { DesignStep, SellStep } from "@/components/onboarding/launch-shell";

import messages from "../messages/en.json";

// What to sell now came back empty (#233): Qloo found nothing new rising.
vi.mock("@/components/app/drop-directions", () => ({
  DropDirections: () => <p>{messages.Wizard.directions.none}</p>,
}));

vi.mock("@/i18n/navigation", () => ({
  Link: () => null,
  useRouter: () => ({ push: () => {} }),
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

const render = (node: React.ReactNode) =>
  renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
        {node}
      </NextIntlClientProvider>
    </QueryClientProvider>
  );

const nextButton = (html: string) =>
  /<button[^>]*>[^<]*Next: your store/u.exec(html)?.[0] ?? "";

describe("pick what to sell with no directions", () => {
  it("offers a brief field, and Next waits for a brief", () => {
    const html = render(
      <SellStep brand={null} brief={undefined} onNext={() => {}} />
    );

    expect(html).toContain("Qloo found nothing new rising right now");
    expect(html).toContain("<textarea");
    expect(html).toContain(messages.Wizard.brief.label);
    expect(nextButton(html)).toContain(`disabled=""`);
  });

  it("enables Next with a brief in the field", () => {
    const html = render(
      <SellStep brand={null} brief="Ghibli tees" onNext={() => {}} />
    );

    expect(html).toContain("Ghibli tees</textarea>");
    expect(nextButton(html)).not.toContain(`disabled=""`);
  });

  it("researches the typed brief, and never an empty one", () => {
    const typed = render(
      <DesignStep brief="Ghibli tees" onRun={() => {}} run={undefined} />
    );
    const empty = render(
      <DesignStep brief={undefined} onRun={() => {}} run={undefined} />
    );

    expect(typed).toContain("wovain researches “Ghibli tees”");
    expect(empty).not.toContain("“”");
    expect(empty).toContain(messages.Launch.design.noBrief);
  });
});
