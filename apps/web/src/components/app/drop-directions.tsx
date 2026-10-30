"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import type { DropReason } from "@wovain/core/sweet-spot";
import type { DirectionsChunk } from "@wovain/mastra/flow/drop-directions";
import { Button } from "@wovain/ui/components/button";
import { Label } from "@wovain/ui/components/label";
import { Skeleton } from "@wovain/ui/components/skeleton";
import { Switch } from "@wovain/ui/components/switch";
import { ArrowRight, RefreshCw, Shuffle, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useState } from "react";

import { Citations } from "@/components/app/citations";
import { IdeaCarousel } from "@/components/app/idea-carousel";
import { WhoBuysPanel } from "@/components/app/who-buys";
import { IdeaCardView } from "@/components/ideas/idea-card-view";
import { OutcomeWhy } from "@/components/insights/outcome-why";
import { Link } from "@/i18n/navigation";
import { orpc } from "@/utils/orpc";

const NOT_FOUND = 404;
const SKELETON_ROWS = ["a", "b", "c"] as const;
const SECOND_MS = 1000;

const statusOf = (error: unknown) =>
  typeof error === "object" && error !== null && "status" in error
    ? (error as { status?: unknown }).status
    : undefined;

type Directions = Extract<DirectionsChunk, { kind: "done" }>["answer"];
type Direction = Directions["directions"][number];
type Step = Extract<DirectionsChunk, { kind: "step" }>["step"];

/** A picked direction: its brief, and where it sits in the kept answer. */
export interface DirectionPick {
  brief: string;
  ignoreBrand: boolean;
  key: string;
  round: number;
  theme: string;
}

// What the chunks streamed so far add up to: the whole answer once done,
// else the cards written so far (best first) and the step under way.
export const progressOf = (chunks: readonly DirectionsChunk[]) => {
  let answer: Directions | undefined;
  let step: Step | undefined;
  // A card arrives with its facts, then again with its words: the last wins.
  const cards = new Map<string, Direction>();
  for (const chunk of chunks) {
    if (chunk.kind === "done") {
      ({ answer } = chunk);
    } else if (chunk.kind === "step") {
      ({ step } = chunk);
    } else if (chunk.kind === "withdrawn") {
      // Its words failed the evidence check: not shown after all.
      cards.delete(chunk.key);
    } else {
      cards.set(chunk.direction.key, chunk.direction);
    }
  }
  return {
    answer,
    cards: (answer?.directions ?? [...cards.values()]).toSorted(
      (first, second) => second.score - first.score
    ),
    step,
  };
};

/** Seconds since `running` turned on, ticking while it stays on. */
const useElapsed = (running: boolean) => {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!running) {
      return;
    }
    const started = Date.now();
    const tick = () => {
      setSeconds(Math.floor((Date.now() - started) / SECOND_MS));
    };
    // The first tick resets the count; then once a second.
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, SECOND_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [running]);
  return seconds;
};

/** A placeholder shaped like a direction card: title, why, evidence, links. */
const CardSkeleton = () => (
  <li
    aria-hidden="true"
    className="border-border bg-card flex flex-col gap-2 rounded-xl border p-4"
  >
    <div className="flex items-start justify-between gap-3">
      <Skeleton className="h-5 w-2/5" />
      <Skeleton className="h-4 w-24" />
    </div>
    <Skeleton className="h-4 w-4/5" />
    <Skeleton className="h-3 w-3/5" />
    <div className="flex gap-3">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="h-3 w-20" />
    </div>
  </li>
);

/** The step under way and the seconds so far, read out politely. */
const StepLine = ({ seconds, step }: { seconds: number; step?: Step }) => {
  const t = useTranslations("Wizard.directions");
  return (
    <p aria-live="polite" className="text-muted-foreground text-xs">
      {t(`steps.${step ?? "qloo"}`)}{" "}
      <span className="figures">{t("elapsed", { seconds })}</span>
    </p>
  );
};

/** What backs a direction, in one line: who, what is rising, news, crowding. */
const EvidenceLine = ({ evidence }: { evidence: Direction["evidence"] }) => {
  const t = useTranslations("Wizard.directions");
  const { audience, demand, momentum, rising, saturation } = evidence;
  const parts = [
    demand?.ads === undefined || demand.ads.validated === 0
      ? undefined
      : t("proof.ads", {
          count: demand.ads.validated,
          days: demand.ads.evergreen > 0 ? "30" : "14",
        }),
    demand?.market === undefined || demand.market.bestsellers === 0
      ? undefined
      : t("proof.bestsellers", { count: demand.market.bestsellers }),
    demand?.market === undefined || demand.market.reviews === 0
      ? undefined
      : t("proof.reviews", { count: demand.market.reviews }),
    audience === undefined ? undefined : t("for", { audience }),
    rising.length === 0
      ? undefined
      : t("rising", { names: rising.map((one) => one.name).join(", ") }),
    momentum === undefined
      ? t("newsUnknown")
      : t("news", { count: momentum.hits }),
    saturation === undefined
      ? t("listingsUnknown")
      : t(`listings.${saturation.level}`, { count: saturation.count }),
  ].filter((part): part is string => part !== undefined);
  return <p className="text-muted-foreground text-xs">{parts.join(" · ")}</p>;
};

/** The ads and listings that prove a direction sells, linked. */
const ProofLinks = ({ direction }: { direction: Direction }) => {
  const t = useTranslations("Wizard.directions");
  const { demand } = direction.evidence;
  const links = [
    ...(demand?.ads?.samples ?? []).map((sample) => ({
      title: sample.page,
      url: sample.url,
    })),
    ...(demand?.market?.listings ?? []),
  ];
  return links.length === 0 ? null : (
    <Citations
      citations={links}
      label={t("proofSources", { title: direction.title })}
      max={4}
    />
  );
};

/** "Who buys this", read from Qloo when the merchant opens it. */
const BuyersToggle = ({ entities }: { entities: string[] }) => {
  const t = useTranslations("Wizard.directions");
  const [open, setOpen] = useState(false);
  if (entities.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-col gap-2">
      <Button
        aria-expanded={open}
        className="self-start"
        onClick={() => setOpen((previous) => !previous)}
        size="sm"
        type="button"
        variant="ghost"
      >
        <Users aria-hidden="true" data-icon="inline-start" />
        {open ? t("hideBuyers") : t("showBuyers")}
      </Button>
      {open ? <WhoBuysPanel entities={entities} /> : null}
    </div>
  );
};

/** One suggested direction: the title starts the drop, the evidence cites. */
// No theme to show: what the evidence gate checked, and why each fell short.
const CheckedList = ({
  checked,
}: {
  checked: readonly { reason: DropReason; theme: string }[];
}) => {
  const t = useTranslations("IdeaCard");
  return (
    <div className="flex flex-col gap-1">
      <p className="text-muted-foreground text-sm">{t("noneChecked")}</p>
      <ul className="text-muted-foreground list-disc ps-5 text-sm">
        {checked.map((one) => (
          <li key={`${one.theme}:${one.reason}`}>
            {one.theme}: {t(`dropped.${one.reason}`)}
          </li>
        ))}
      </ul>
    </div>
  );
};

// story-ui: the one fixed idea card, with the start button.
const StoryCard = ({
  card,
  direction,
  disabled,
  onUse,
}: {
  card: NonNullable<Direction["card"]>;
  direction: Direction;
  disabled: boolean;
  onUse: (direction: Direction) => void;
}) => {
  const t = useTranslations("Wizard.directions");
  const tCard = useTranslations("IdeaCard");
  return (
    <div className="border-border bg-card flex h-full flex-col rounded-xl border p-4">
      <IdeaCardView
        card={card}
        readAudience={
          <BuyersToggle
            entities={direction.evidence.rising.map((one) => one.id)}
          />
        }
      >
        {direction.caution === undefined ? null : (
          <p className="text-muted-foreground text-xs">
            {tCard(`caution.${direction.caution}`)}
          </p>
        )}
        <Button
          className="h-9 w-fit px-4"
          disabled={disabled}
          onClick={() => onUse(direction)}
          type="button"
        >
          {t("use")}
          <ArrowRight aria-hidden="true" data-icon="inline-end" />
        </Button>
      </IdeaCardView>
    </div>
  );
};

// story-ui: the ideas one card at a time; a placeholder card until the
// first is written.
const StoryCards = ({
  cards,
  disabled,
  loading,
  onUse,
}: {
  cards: readonly Direction[];
  disabled: boolean;
  loading: boolean;
  onUse: (direction: Direction) => void;
}) => {
  const t = useTranslations("Wizard.directions.carousel");
  const items = cards.flatMap((direction) =>
    direction.card === undefined
      ? []
      : [
          {
            key: direction.key,
            node: (
              <StoryCard
                card={direction.card}
                direction={direction}
                disabled={disabled}
                onUse={onUse}
              />
            ),
          },
        ]
  );
  if (items.length === 0) {
    return loading ? (
      <ul aria-busy="true">
        <CardSkeleton />
      </ul>
    ) : null;
  }
  return <IdeaCarousel items={items} label={t("label")} />;
};

const DirectionRow = ({
  direction,
  disabled,
  onUse,
}: {
  direction: Direction;
  disabled: boolean;
  onUse: (direction: Direction) => void;
}) => {
  const t = useTranslations("Wizard.directions");
  const tCard = useTranslations("IdeaCard");
  const id = useId();
  const { momentum } = direction.evidence;
  return (
    <li className="border-border bg-card has-[button:hover]:border-foreground/40 flex flex-col gap-2 rounded-xl border p-4 transition-colors">
      <button
        aria-describedby={`${id}-why`}
        className="group focus-visible:ring-ring flex items-start justify-between gap-3 rounded-md text-start outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={disabled}
        onClick={() => onUse(direction)}
        type="button"
      >
        <span className="flex flex-col gap-1">
          <span className="font-medium">{direction.title}</span>
          {direction.buyer === undefined ? null : (
            <span className="text-sm">
              {direction.occasion === undefined
                ? direction.buyer
                : `${direction.buyer} · ${direction.occasion}`}
            </span>
          )}
          <span className="text-muted-foreground text-sm" id={`${id}-why`}>
            {direction.whyNow === ""
              ? t("whyFallback", { count: momentum?.hits ?? 0 })
              : direction.whyNow}
          </span>
        </span>
        <span className="text-accent-text inline-flex shrink-0 items-center gap-1 text-sm font-medium">
          {t("use")}
          <ArrowRight
            aria-hidden="true"
            className="size-4 transition-transform duration-150 ease-out group-hover:translate-x-0.5 motion-reduce:transition-none"
          />
        </span>
      </button>
      {direction.caution === undefined ? null : (
        <p className="text-muted-foreground text-xs">
          {tCard(`caution.${direction.caution}`)}
        </p>
      )}
      {direction.outcome === undefined ? null : (
        <OutcomeWhy why={direction.outcome} />
      )}
      <EvidenceLine evidence={direction.evidence} />
      <ProofLinks direction={direction} />
      {momentum === undefined ? null : (
        <Citations
          citations={momentum.sources}
          label={t("sources", { title: direction.title })}
          max={3}
        />
      )}
      <BuyersToggle entities={direction.evidence.rising.map((one) => one.id)} />
    </li>
  );
};

/** "Ignore my brand this time", shown only to a merchant with a brand. */
const IgnoreBrandSwitch = ({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled: boolean;
  onChange: (next: boolean) => void;
}) => {
  const t = useTranslations("Wizard.directions");
  const id = useId();
  return (
    <div className="flex items-center gap-2">
      <Switch
        checked={checked}
        disabled={disabled}
        id={id}
        onCheckedChange={onChange}
      />
      <Label className="text-sm font-normal" htmlFor={id}>
        {t("ignoreBrand")}
      </Label>
    </div>
  );
};

/** The cards so far, the loading state, or the failure. */
const DirectionsBody = ({
  briefBelow,
  story,
  cards,
  disabled,
  error,
  loading,
  onRetry,
  onUse,
  retrying,
  seconds,
  step,
  tavilyFailed,
  checked,
  unconfirmed,
}: {
  // What the evidence gate checked, theme by theme, and why each fell short.
  checked: readonly { reason: DropReason; theme: string }[];
  // No theme passed the gate: the cards carry their caution.
  unconfirmed: boolean;
  cards: readonly Direction[];
  disabled: boolean;
  error: Error | undefined;
  loading: boolean;
  onRetry: () => Promise<void>;
  onUse: (direction: Direction) => void;
  retrying: boolean;
  seconds: number;
  step: Step | undefined;
  tavilyFailed: boolean;
  briefBelow: boolean;
  story: boolean;
}) => {
  const t = useTranslations("Wizard.directions");
  const tCard = useTranslations("IdeaCard");
  if (error !== undefined) {
    return (
      <div
        className="border-border flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed p-4"
        role="alert"
      >
        <p className="text-muted-foreground text-sm">
          {error.message || t("failed")}
        </p>
        <Button
          disabled={retrying}
          onClick={onRetry}
          size="sm"
          type="button"
          variant="outline"
        >
          <RefreshCw aria-hidden="true" data-icon="inline-start" />
          {t("retry")}
        </Button>
      </div>
    );
  }
  const waiting = loading ? SKELETON_ROWS.slice(cards.length) : [];
  const empty = !loading && cards.length === 0;
  return (
    <>
      {loading ? <StepLine seconds={seconds} step={step} /> : null}
      {empty && checked.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {briefBelow ? t("none") : t("noneHome")}
        </p>
      ) : null}
      {empty && checked.length > 0 ? <CheckedList checked={checked} /> : null}
      {!loading && unconfirmed && cards.length > 0 ? (
        <p className="text-muted-foreground text-sm">{tCard("unconfirmed")}</p>
      ) : null}
      {story ? (
        <StoryCards
          cards={cards}
          disabled={disabled}
          loading={loading}
          onUse={onUse}
        />
      ) : null}
      {!story && (cards.length > 0 || waiting.length > 0) ? (
        <ul aria-busy={loading} className="flex flex-col gap-2">
          {cards.map((direction) => (
            <DirectionRow
              direction={direction}
              disabled={disabled}
              key={direction.key}
              onUse={onUse}
            />
          ))}
          {waiting.map((key) => (
            <CardSkeleton key={key} />
          ))}
        </ul>
      ) : null}
      {!loading && tavilyFailed ? (
        <p className="text-muted-foreground text-xs">{t("tavilyFailed")}</p>
      ) : null}
    </>
  );
};

// What the answer says about itself, once it has arrived.
const answerFlags = (
  data:
    | {
        checked?: readonly { reason: DropReason; theme: string }[] | undefined;
        tavilyFailed?: boolean | undefined;
        unconfirmed?: boolean | undefined;
      }
    | undefined
) => ({
  checked: data?.checked ?? [],
  tavilyFailed: data?.tavilyFailed === true,
  unconfirmed: data?.unconfirmed === true,
});

// Points a merchant without a brand to where it is made.
const BrandHint = () => {
  const t = useTranslations("Wizard.directions");
  return (
    <p className="text-muted-foreground text-xs">
      {t("brandHint")}{" "}
      <Link
        className="text-accent-text font-medium underline underline-offset-2"
        href="/dashboard/onboarding?step=sell"
      >
        {t("brandHintLink")}
      </Link>
    </p>
  );
};

// The switches beside the title: ignore the brand, show others.
const DirectionsActions = ({
  hasBrand,
  ignoreBrand,
  loading,
  onIgnoreBrand,
  onOthers,
  showOthers,
}: {
  hasBrand: boolean;
  ignoreBrand: boolean;
  loading: boolean;
  onIgnoreBrand: (value: boolean) => void;
  onOthers: () => void;
  showOthers: boolean;
}) => {
  const t = useTranslations("Wizard.directions");
  return (
    <div className="flex flex-wrap items-center gap-3">
      {hasBrand ? (
        <IgnoreBrandSwitch
          checked={ignoreBrand}
          disabled={loading}
          onChange={onIgnoreBrand}
        />
      ) : null}
      {showOthers ? (
        <Button
          disabled={loading}
          onClick={onOthers}
          size="sm"
          type="button"
          variant="outline"
        >
          <Shuffle aria-hidden="true" data-icon="inline-start" />
          {t("others")}
        </Button>
      ) : null}
    </div>
  );
};

/**
 * What to sell now, in the new-drop step: 3 to 5 directions from Qloo
 * trends with this month's news and how crowded the listings are. Within
 * the brand when there is one ("Ignore my brand this time" opens it up),
 * else across Qloo audiences, a new set on "Show me others". One click
 * starts the drop; the free-text brief stays below. Never shown without
 * Qloo: a Qloo failure offers a retry.
 */
// An h2 heads a page section (the Home); an h3 sits inside a step.
const HEADING_CLASS = {
  h2: "font-display text-lg font-semibold tracking-[-0.015em]",
  h3: "text-sm font-semibold",
} as const;

// The lead under the title: within the brand or not, with a brief field
// below (the new-drop step) or not (the Home).
const LEADS = {
  all: { below: "lead", home: "leadHome" },
  brand: { below: "leadBrand", home: "leadBrandHome" },
} as const;

export const DropDirections = ({
  briefBelow = true,
  disabled,
  heading: Heading = "h3",
  onUse,
  story = false,
}: {
  // The story-ui flag: each suggestion as the one fixed idea card.
  story?: boolean;
  // A free-text brief follows (the new-drop step); the Home has none.
  briefBelow?: boolean;
  disabled: boolean;
  // h2 where it heads a page section (the story Home), else h3.
  heading?: "h2" | "h3";
  onUse: (pick: DirectionPick) => void;
}) => {
  const t = useTranslations("Wizard.directions");
  const headingId = useId();
  const [ignoreBrand, setIgnoreBrand] = useState(false);
  const [round, setRound] = useState(0);
  // Kept suggestions arrive at once; a new search streams card by card.
  const directions = useQuery(
    orpc.runs.directions.experimental_streamedOptions({
      input: { ignoreBrand, round },
      queryFnOptions: { refetchMode: "reset" },
      retry: false,
      staleTime: Number.POSITIVE_INFINITY,
    })
  );
  const { answer, cards, step } = progressOf(directions.data ?? []);
  const loading = !directions.isError && answer === undefined;
  const seconds = useElapsed(loading);
  // The drop-directions flag is off: nothing to show.
  if (directions.isError && statusOf(directions.error) === NOT_FOUND) {
    return null;
  }
  const data = answer;
  const within = data?.scope === "brand";
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <Heading className={HEADING_CLASS[Heading]} id={headingId}>
            {within ? t("titleBrand") : t("title")}
          </Heading>
          <p className="text-muted-foreground max-w-[65ch] text-sm">
            {t(LEADS[within ? "brand" : "all"][briefBelow ? "below" : "home"])}
          </p>
        </div>
        <DirectionsActions
          hasBrand={data?.hasBrand === true}
          ignoreBrand={ignoreBrand}
          loading={loading}
          onIgnoreBrand={setIgnoreBrand}
          onOthers={() => setRound((previous) => previous + 1)}
          showOthers={data !== undefined && !within}
        />
      </div>
      <DirectionsBody
        story={story}
        cards={cards}
        disabled={disabled}
        error={directions.isError ? directions.error : undefined}
        loading={loading}
        onRetry={async () => {
          await directions.refetch();
        }}
        onUse={(direction) =>
          onUse({
            brief: direction.brief,
            ignoreBrand,
            key: direction.key,
            round,
            theme: direction.theme,
          })
        }
        retrying={directions.isFetching}
        seconds={seconds}
        step={step}
        briefBelow={briefBelow}
        {...answerFlags(data)}
      />
      {data !== undefined && !data.hasBrand ? <BrandHint /> : null}
    </section>
  );
};

/**
 * Opening the app asks for the suggestions in the background when the kept
 * ones are missing or stale, so the new-drop step opens at once.
 */
export const WarmDirections = () => {
  const { mutate } = useMutation(orpc.runs.warmDirections.mutationOptions());
  useEffect(() => {
    mutate({});
  }, [mutate]);
  return null;
};
