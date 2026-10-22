import { Button } from "@openai/apps-sdk-ui/components/Button";
import { ChevronLeft } from "@openai/apps-sdk-ui/components/Icon";
import { ratioLabel } from "@wovain/shared/ad";
import type { Ad, AdAsset } from "@wovain/shared/ad";
import { money } from "@wovain/shared/economics";
import { useId, useState } from "react";

import { useAction } from "../lib/use-action.ts";
import { ActionError } from "../lib/widget-shell.tsx";
import { ConceptCard } from "./concept-card.tsx";

export interface AdWidgetActions {
  // Starts the campaign step, which builds the campaign paused.
  onCreateCampaign: (ad: Ad) => Promise<void>;
  // Records the choice and returns the product's ads with it.
  onDecide: (
    ad: Ad,
    conceptId: string,
    status: "approved" | "skipped"
  ) => Promise<Ad>;
  onFeedback: (ad: Ad, conceptId: string, feedback: string) => Promise<void>;
  // Asks the host for full screen (or back to inline).
  onFullscreen: (on: boolean) => Promise<void>;
  onRetry: (ad: Ad, conceptId: string, asset: AdAsset) => Promise<void>;
}

export interface AdWidgetViewProps extends AdWidgetActions {
  ad: Ad;
}

type Busy = "approved" | "skipped" | "feedback" | "retry" | "campaign";

const times = (value: number) => `${value.toFixed(1)}×`;

const Economics = ({ ad }: { ad: Ad }) => {
  const { economics: e, rules } = ad;
  return (
    <div className="border-subtle mt-4 grid gap-1 border-t pt-4 text-sm">
      <p className="text-secondary m-0">
        {`${money(e.price)} − ${money(e.baseCost)} base − ${money(e.cardFees)} fees − ${money(e.refundReserve)} reserve = `}
        <span className="text-default font-semibold">
          {money(e.breakevenPerSale)}
        </span>
      </p>
      <p className="m-0">
        {`Breakeven: ${money(e.breakevenPerSale)} per sale · ${times(e.roas)} return on ad spend`}
        <span className="text-secondary">{` (${times(e.roasOnOrderValue)} on order value)`}</span>
      </p>
      <p className="text-secondary m-0">
        {`Rules: off at ${money(rules.killNoSalesAt)} with no sales · budget +${rules.scaleStepPct}% under ${money(rules.scaleUnder)}`}
      </p>
    </div>
  );
};

const FullScreen = ({
  asset,
  onClose,
}: {
  asset: AdAsset;
  onClose: () => void;
}) => (
  <section
    aria-label={`${ratioLabel(asset.ratio)} full screen`}
    className="flex h-full flex-col gap-2 p-3"
  >
    <button
      className="text-secondary flex items-center gap-1 self-start text-sm"
      onClick={onClose}
      type="button"
    >
      <ChevronLeft aria-hidden className="size-4" />
      Back to the ads
    </button>
    <p className="text-secondary m-0 text-xs">
      Check that the print matches your design before you approve.
    </p>
    {asset.kind === "video" ? (
      <video
        aria-label={asset.alt}
        autoPlay
        className="mx-auto max-h-[80vh] rounded-xl bg-black"
        controls
        loop
        muted
        playsInline
        src={asset.url}
      />
    ) : (
      <img
        alt={asset.alt}
        className="mx-auto max-h-[80vh] rounded-xl"
        height={1350}
        src={asset.url}
        width={1080}
      />
    )}
  </section>
);

const summary = (ad: Ad) => {
  const approved = ad.concepts.filter((c) => c.status === "approved").length;
  const open = ad.concepts.filter((c) => c.status === "draft").length;
  const total = `${ad.concepts.length} ad concept${ad.concepts.length === 1 ? "" : "s"}`;
  return open > 0
    ? `${total} · ${approved} approved · ${open} to decide`
    : `${total} · ${approved} approved`;
};

export const AdWidgetView = ({
  ad: initialAd,
  onCreateCampaign,
  onDecide,
  onFeedback,
  onFullscreen,
  onRetry,
}: AdWidgetViewProps) => {
  const titleId = useId();
  const [ad, setAd] = useState(initialAd);
  const [focused, setFocused] = useState<AdAsset | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const { busy, failed, run } = useAction<Busy>();
  const ready = ad.status === "added";

  const act = async (
    kind: Busy,
    conceptId: string,
    work: () => Promise<void>
  ) => {
    setTarget(conceptId);
    return await run(kind, work);
  };

  if (focused?.url !== undefined) {
    return (
      <FullScreen
        asset={focused}
        onClose={() => {
          setFocused(null);
          void onFullscreen(false);
        }}
      />
    );
  }

  return (
    <article aria-labelledby={titleId} className="p-4">
      <header className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <h2 className="heading-sm m-0" id={titleId}>
          {`Ads · ${ad.productTitle}`}
        </h2>
        <span className="text-secondary text-xs">{summary(ad)}</span>
      </header>
      <p className="text-secondary mt-1 text-sm">{ad.coach}</p>

      <div className="mt-4 grid gap-3">
        {ad.concepts.map((concept) => (
          <ConceptCard
            busy={target === concept.id && busy !== "campaign" ? busy : null}
            concept={concept}
            key={concept.id}
            onDecide={(status) => {
              void act(status, concept.id, async () => {
                setAd(await onDecide(ad, concept.id, status));
              });
            }}
            onExpand={(asset) => {
              setFocused(asset);
              void onFullscreen(true);
            }}
            onFeedback={async (feedback) =>
              await act("feedback", concept.id, async () => {
                await onFeedback(ad, concept.id, feedback);
              })
            }
            onRetry={(asset) => {
              void act("retry", concept.id, async () => {
                await onRetry(ad, concept.id, asset);
              });
            }}
          />
        ))}
      </div>

      <Economics ad={ad} />

      {ready ? (
        <div className="border-subtle mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-t pt-4">
          <Button
            className="wovain-accent"
            color="primary"
            disabled={busy !== null}
            loading={busy === "campaign"}
            onClick={() => {
              void run("campaign", async () => {
                await onCreateCampaign(ad);
              });
            }}
          >
            Create campaign
          </Button>
          <span className="text-secondary text-xs">
            Built paused in Meta. Nothing spends until you press Launch.
          </span>
        </div>
      ) : null}
      <ActionError failed={failed} />
    </article>
  );
};
