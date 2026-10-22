import { Badge } from "@openai/apps-sdk-ui/components/Badge";
import { Button } from "@openai/apps-sdk-ui/components/Button";
import { ArrowUp, Expand, Play } from "@openai/apps-sdk-ui/components/Icon";
import { Input } from "@openai/apps-sdk-ui/components/Input";
import { ratioLabel } from "@wovain/shared/ad";
import type { AdAsset, AdConcept, AdRatio, Decision } from "@wovain/shared/ad";
import { useId, useState } from "react";

const aspect: Record<AdRatio, string> = {
  "1:1": "aspect-square",
  "4:5": "aspect-[4/5]",
  "9:16": "aspect-[9/16]",
};

const ctaLabel = (cta: AdConcept["cta"]) =>
  cta.charAt(0) + cta.slice(1).toLowerCase().replaceAll("_", " ");

const Tile = ({
  asset,
  busy,
  onExpand,
  onRetry,
}: {
  asset: AdAsset;
  busy: boolean;
  onExpand: () => void;
  onRetry: () => void;
}) => {
  const frame = `border-subtle relative w-full overflow-hidden rounded-lg border ${aspect[asset.ratio]}`;
  if (asset.status === "failed" || asset.url === undefined) {
    return (
      <div
        className={`${frame} bg-surface-secondary flex flex-col items-center justify-center gap-2 p-2 text-center`}
      >
        <p className="text-secondary m-0 text-xs">{`${ratioLabel(asset.ratio)} didn't render.`}</p>
        <Button
          color="secondary"
          disabled={busy}
          onClick={onRetry}
          size="sm"
          variant="soft"
        >
          Retry
        </Button>
      </div>
    );
  }
  return (
    <div className={`${frame} bg-black`}>
      {asset.kind === "video" ? (
        // Ads autoplay muted on Meta, so the preview stays muted too.
        <video
          aria-label={asset.alt}
          className="size-full object-cover"
          muted
          playsInline
          preload="metadata"
          src={asset.url}
        />
      ) : (
        <img
          alt={asset.alt}
          className="size-full object-cover"
          height={320}
          src={asset.url}
          width={256}
        />
      )}
      <button
        aria-label={`See full screen: ${asset.alt}`}
        className="absolute inset-0 flex items-center justify-center"
        onClick={onExpand}
        type="button"
      >
        {asset.kind === "video" ? (
          <span className="rounded-full bg-black/55 p-2 text-white">
            <Play aria-hidden className="size-4" />
          </span>
        ) : (
          <span className="absolute top-1.5 right-1.5 rounded-md bg-black/55 p-1 text-white">
            <Expand aria-hidden className="size-3.5" />
          </span>
        )}
      </button>
    </div>
  );
};

// The visuals in a row: each tile is labelled with its placement, and fal
// output is marked AI-made, as Meta may label it.
const Visuals = ({
  busy,
  concept,
  onExpand,
  onRetry,
}: {
  busy: boolean;
  concept: AdConcept;
  onExpand: (asset: AdAsset) => void;
  onRetry: (asset: AdAsset) => void;
}) => (
  <ul className="m-0 grid list-none grid-cols-3 items-end gap-2 p-0">
    {concept.assets.map((asset) => (
      <li
        className="grid gap-1"
        key={`${asset.ratio}-${asset.kind}-${asset.url ?? asset.alt}`}
      >
        <Tile
          asset={asset}
          busy={busy}
          onExpand={() => {
            onExpand(asset);
          }}
          onRetry={() => {
            onRetry(asset);
          }}
        />
        <span className="text-secondary text-xs">
          {`${ratioLabel(asset.ratio)}${asset.kind === "video" ? " · video" : ""}${asset.source === "fal" ? " · AI" : " · mockup"}`}
        </span>
      </li>
    ))}
    {(concept.cards ?? []).map((card) => (
      <li className="grid gap-1" key={card.designId}>
        <img
          alt={`Mockup for ${card.headline}`}
          className="border-subtle aspect-square w-full rounded-lg border object-cover"
          height={256}
          src={card.imageUrl}
          width={256}
        />
        <span className="text-secondary text-xs">{card.headline}</span>
      </li>
    ))}
  </ul>
);

const Signals = ({ concept }: { concept: AdConcept }) => {
  const rows = [
    ["Who", concept.audience],
    ["Why now", concept.whyNow],
    ["Gap", concept.gap],
  ].filter((row): row is [string, string] => row[1] !== undefined);
  return (
    <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
      {rows.map(([label, value]) => (
        <div className="contents" key={label}>
          <dt className="text-secondary">{label}</dt>
          <dd className="m-0">{value}</dd>
        </div>
      ))}
    </dl>
  );
};

// Every variant goes to Meta; the first one is what most people see.
const Variants = ({ label, values }: { label: string; values: string[] }) => (
  <div className="grid gap-0.5 text-sm">
    <span className="text-secondary text-xs">{`${label} · ${values.length} for Meta to test`}</span>
    <ol className="m-0 grid list-decimal gap-0.5 pl-5">
      {values.map((value) => (
        <li key={value}>{value}</li>
      ))}
    </ol>
  </div>
);

const decided = (status: AdConcept["status"]) =>
  status === "approved" ? (
    <span className="wovain-status-live rounded-full px-2 py-0.5 text-xs font-medium">
      Approved
    </span>
  ) : (
    <Badge color="secondary">Skipped</Badge>
  );

// The concept action running, if any.
export type ConceptBusy = Decision | "feedback" | "retry";

interface ConceptActions {
  onDecide: (status: Decision) => void;
  onExpand: (asset: AdAsset) => void;
  onFeedback: (feedback: string) => Promise<boolean>;
  onRetry: (asset: AdAsset) => void;
}

export const ConceptCard = ({
  busy,
  concept,
  onDecide,
  onExpand,
  onFeedback,
  onRetry,
}: ConceptActions & {
  busy: ConceptBusy | null;
  concept: AdConcept;
}) => {
  const titleId = useId();
  const feedbackId = useId();
  const [feedback, setFeedback] = useState("");
  const pending = busy !== null;
  return (
    <article
      aria-labelledby={titleId}
      className="border-subtle grid gap-3 rounded-xl border p-3"
    >
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h3 className="heading-xs m-0" id={titleId}>
          {concept.name}
        </h3>
        <span className="text-secondary text-xs">
          {concept.cards === undefined
            ? concept.angle
            : "Carousel across your products"}
        </span>
        {concept.revision > 1 ? (
          <span className="text-secondary text-xs">{`· revision ${concept.revision}`}</span>
        ) : null}
        <span className="ml-auto">
          {concept.status === "draft" ? null : decided(concept.status)}
        </span>
      </header>
      {concept.feedback === undefined ? null : (
        <p className="text-secondary m-0 text-xs">{`Changed for “${concept.feedback}”`}</p>
      )}
      <p className="m-0 text-base font-medium">{concept.hook}</p>
      <Signals concept={concept} />
      <Visuals
        busy={pending}
        concept={concept}
        onExpand={onExpand}
        onRetry={onRetry}
      />
      <Variants label="Headlines" values={concept.headlines} />
      <Variants label="Primary text" values={concept.primaryTexts} />
      <p className="text-secondary m-0 text-xs">{`Button: ${ctaLabel(concept.cta)}`}</p>
      {concept.status === "draft" ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            className="wovain-accent"
            color="primary"
            disabled={pending}
            loading={busy === "approved"}
            onClick={() => {
              onDecide("approved");
            }}
            size="sm"
          >
            Approve
          </Button>
          <Button
            color="secondary"
            disabled={pending}
            loading={busy === "skipped"}
            onClick={() => {
              onDecide("skipped");
            }}
            size="sm"
            variant="soft"
          >
            Skip
          </Button>
          <form
            className="min-w-48 flex-1"
            onSubmit={(event) => {
              event.preventDefault();
              const text = feedback.trim();
              const send = async () => {
                if (await onFeedback(text)) {
                  setFeedback("");
                }
              };
              if (text !== "") {
                void send();
              }
            }}
          >
            <label className="sr-only" htmlFor={feedbackId}>
              {`Feedback on ${concept.name}`}
            </label>
            <Input
              disabled={pending}
              endAdornment={
                <button
                  aria-label={`Send feedback on ${concept.name}`}
                  className="text-secondary hover:text-default disabled:opacity-40"
                  disabled={feedback.trim() === "" || pending}
                  type="submit"
                >
                  <ArrowUp aria-hidden className="size-4" />
                </button>
              }
              id={feedbackId}
              onChange={(event) => {
                setFeedback(event.target.value);
              }}
              placeholder="More playful, use the back print…"
              size="sm"
              value={feedback}
            />
          </form>
        </div>
      ) : null}
    </article>
  );
};
