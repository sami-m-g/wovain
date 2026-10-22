import { Badge } from "@openai/apps-sdk-ui/components/Badge";
import { Button } from "@openai/apps-sdk-ui/components/Button";
import type { Campaign } from "@wovain/shared/campaign";
import { money } from "@wovain/shared/economics";
import { useId, useState } from "react";

import { useAction } from "../lib/use-action.ts";
import { ActionError } from "../lib/widget-shell.tsx";

export interface CampaignWidgetActions {
  // Asks the campaign playbook to publish; nothing spends before this.
  onLaunch: (campaign: Campaign) => Promise<void>;
  onOpen: (url: string) => Promise<void>;
  onRecheck: (campaign: Campaign) => Promise<void>;
}

export interface CampaignWidgetViewProps extends CampaignWidgetActions {
  campaign: Campaign;
}

const statusBadge = (status: Campaign["status"]) => {
  if (status === "live") {
    return (
      <span className="wovain-status-live rounded-full px-2 py-0.5 text-xs font-medium">
        Live
      </span>
    );
  }
  if (status === "blocked") {
    return <Badge color="danger">Ready, blocked</Badge>;
  }
  return <Badge color="secondary">Ready to launch</Badge>;
};

export const CampaignWidgetView = ({
  campaign,
  onLaunch,
  onOpen,
  onRecheck,
}: CampaignWidgetViewProps) => {
  const titleId = useId();
  const { failed, pending, run } = useAction<"go">();
  const [sent, setSent] = useState(false);
  const ads = campaign.products.reduce((sum, p) => sum + p.ads, 0);

  const send = async (action: () => Promise<void>) => {
    if (await run("go", action)) {
      setSent(true);
    }
  };

  return (
    <article aria-labelledby={titleId} className="p-4">
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h2 className="heading-sm" id={titleId}>
          Advantage+ sales campaign
        </h2>
        <span className="ml-auto">{statusBadge(campaign.status)}</span>
      </header>
      <p className="text-secondary mt-1 text-sm">
        {`${campaign.products.length} ${campaign.products.length === 1 ? "product" : "products"} · ${ads} ${ads === 1 ? "ad" : "ads"} · ${money(campaign.dailyBudget)} a day`}
      </p>

      <ul className="m-0 mt-3 grid list-none gap-1 p-0 text-sm">
        {campaign.products.map((product) => (
          <li key={product.designId}>
            {`${product.title} `}
            <span className="text-secondary">{`· ${product.ads} ${product.ads === 1 ? "ad" : "ads"}`}</span>
          </li>
        ))}
      </ul>

      {campaign.blockers.length > 0 ? (
        <section
          aria-label="What's blocking launch"
          className="border-subtle mt-4 grid gap-2 border-t pt-4 text-sm"
        >
          {campaign.blockers.map((blocker) => (
            <div key={blocker.issue}>
              <p className="m-0 font-medium">{blocker.issue}</p>
              <p className="text-secondary m-0">
                {blocker.fix}
                {blocker.url === undefined ? null : (
                  <>
                    {" "}
                    <button
                      className="text-default underline"
                      onClick={() => {
                        void onOpen(blocker.url ?? "");
                      }}
                      type="button"
                    >
                      Open
                    </button>
                  </>
                )}
              </p>
            </div>
          ))}
        </section>
      ) : null}

      <section
        aria-label="Automated rules"
        className="border-subtle mt-4 border-t pt-4"
      >
        <h3 className="m-0 text-sm font-medium">Rules</h3>
        <ul className="m-0 mt-2 grid list-none gap-1.5 p-0 text-sm">
          {campaign.rules.map((rule) => (
            <li className="grid gap-0.5" key={rule.label}>
              <span>
                {`${rule.label} `}
                <span className="text-secondary text-xs">
                  {rule.created ? "· in Meta" : "· not created yet"}
                </span>
              </span>
              <span className="text-secondary text-xs">{rule.detail}</span>
            </li>
          ))}
        </ul>
      </section>

      <div className="border-subtle mt-4 flex flex-wrap items-center gap-2 border-t pt-4">
        {campaign.status === "ready" ? (
          <Button
            className="wovain-accent"
            color="primary"
            disabled={pending || sent}
            loading={pending}
            onClick={() => {
              void send(async () => {
                await onLaunch(campaign);
              });
            }}
          >
            {sent
              ? "Launching…"
              : `Launch at ${money(campaign.dailyBudget)} a day`}
          </Button>
        ) : null}
        {campaign.status === "blocked" ? (
          <Button
            color="secondary"
            disabled={pending || sent}
            loading={pending}
            onClick={() => {
              void send(async () => {
                await onRecheck(campaign);
              });
            }}
            variant="soft"
          >
            {sent ? "Checking…" : "I fixed it, check again"}
          </Button>
        ) : null}
        {campaign.adsManagerUrl === undefined ? null : (
          <Button
            color="secondary"
            onClick={() => {
              void onOpen(campaign.adsManagerUrl ?? "");
            }}
            variant="soft"
          >
            Open in Ads Manager
          </Button>
        )}
      </div>
      <ActionError failed={failed} />
    </article>
  );
};
