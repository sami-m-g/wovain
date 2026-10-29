import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { ScanNow } from "@/components/app/scan-now";
import { ScanButton, ScanStatus } from "@/components/app/scan-now";

import messages from "../messages/en.json";

const render = (node: React.ReactNode) =>
  renderToStaticMarkup(
    <NextIntlClientProvider
      locale="en"
      messages={messages}
      now={new Date("2026-10-29T12:00:00Z")}
      timeZone="UTC"
    >
      {node}
    </NextIntlClientProvider>
  );

const scan = (patch: Partial<ScanNow>): ScanNow => ({
  elapsed: 0,
  finished: false,
  found: 0,
  handleStart: () => {},
  pending: false,
  pollMs: false,
  running: false,
  scan: { kind: "idle" },
  slow: false,
  ...patch,
});

describe("Scan now", () => {
  it("goes pending while the scan runs, with its time inline", () => {
    const running = scan({
      elapsed: 10,
      running: true,
      scan: { kind: "scanning", requestedAt: "2026-10-29T11:59:50Z" },
    });
    const button = render(<ScanButton scan={running} />);
    expect(button).toContain("Scanning…");
    expect(button).toContain("disabled");
    const status = render(<ScanStatus scan={running} />);
    expect(status).toContain("Scanning, started 10 s ago");
    expect(status).toContain("animate-pulse");
  });

  it("puts the result inline when the scan is done", () => {
    const html = render(
      <ScanStatus scan={scan({ finished: true, found: 2 })} />
    );
    expect(html).toContain("Scan finished: 2 new suggestions.");
  });

  it("says when the next scan can run instead of pretending to scan", () => {
    const html = render(
      <ScanStatus
        scan={scan({
          scan: {
            kind: "throttled",
            lastScanAt: "2026-10-29T10:00:00Z",
            nextAt: "2026-10-29T16:00:00Z",
          },
        })}
      />
    );
    expect(html).toContain("You scanned 2 hours ago.");
    expect(html).toContain("4:00");
  });

  it("shows a failed request inline", () => {
    const html = render(
      <ScanStatus
        scan={scan({ scan: { kind: "failed", message: "Network error" } })}
      />
    );
    expect(html).toContain("The scan didn&#x27;t start. Network error");
  });
});
