"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import type { DirectionsChunk } from "@wovain/api/flow/drop-directions";
import { Button } from "@wovain/ui/components/button";
import { Label } from "@wovain/ui/components/label";
import { Skeleton } from "@wovain/ui/components/skeleton";
import { Switch } from "@wovain/ui/components/switch";
import { ArrowRight, RefreshCw, Shuffle, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useState } from "react";

import { Citations } from "@/components/app/citations";
import { WhoBuysPanel } from "@/components/app/who-buys";
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

// What the chunks streamed so far add up to: the whole answer once done,
// else the cards written so far (best first) and the step under way.
const progressOf = (chunks: readonly DirectionsChunk[]) => {
  let answer: Directions | undefined;
  let step: Step | undefined;
  // A card arrives with its facts, then again with its words: the last wins.
  const cards = new Map<string, Direction>();
  for (const chunk of chunks) {
    if (chunk.kind === "done") {
      ({ answer } = chunk);
    } else if (chunk.kind === "step") {
      ({ step } = chunk);
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
const DirectionRow = ({
  direction,
  disabled,
  onUse,
}: {
  direction: Direction;
  disabled: boolean;
  onUse: (brief: string) => void;
}) => {
  const t = useTranslations("Wizard.directions");
  const id = useId();
  const { momentum } = direction.evidence;
  return (
    <li className="border-border bg-card has-[button:hover]:border-foreground/40 flex flex-col gap-2 rounded-xl border p-4 transition-colors">
      <button
        aria-describedby={`${id}-why`}
        className="group focus-visible:ring-ring flex items-start justify-between gap-3 rounded-md text-start outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={disabled}
        onClick={() => onUse(direction.brief)}
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
}: {
  cards: readonly Direction[];
  disabled: boolean;
  error: Error | undefined;
  loading: boolean;
  onRetry: () => Promise<void>;
  onUse: (brief: string) => void;
  retrying: boolean;
  seconds: number;
  step: Step | undefined;
  tavilyFailed: boolean;
}) => {
  const t = useTranslations("Wizard.directions");
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
  return (
    <>
      {loading ? <StepLine seconds={seconds} step={step} /> : null}
      {!loading && cards.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("none")}</p>
      ) : null}
      {cards.length > 0 || waiting.length > 0 ? (
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

/**
 * What to sell now, in the new-drop step: 3 to 5 directions from Qloo
 * trends with this month's news and how crowded the listings are. Within
 * the brand when there is one ("Ignore my brand this time" opens it up),
 * else across Qloo audiences, a new set on "Show me others". One click
 * starts the drop; the free-text brief stays below. Never shown without
 * Qloo: a Qloo failure offers a retry.
 */
export const DropDirections = ({
  disabled,
  onUse,
}: {
  disabled: boolean;
  onUse: (brief: string) => void;
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
          <h3 className="text-sm font-semibold" id={headingId}>
            {within ? t("titleBrand") : t("title")}
          </h3>
          <p className="text-muted-foreground max-w-[65ch] text-sm">
            {within ? t("leadBrand") : t("lead")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {data?.hasBrand ? (
            <IgnoreBrandSwitch
              checked={ignoreBrand}
              disabled={loading}
              onChange={setIgnoreBrand}
            />
          ) : null}
          {data !== undefined && !within ? (
            <Button
              disabled={loading}
              onClick={() => setRound((previous) => previous + 1)}
              size="sm"
              type="button"
              variant="outline"
            >
              <Shuffle aria-hidden="true" data-icon="inline-start" />
              {t("others")}
            </Button>
          ) : null}
        </div>
      </div>
      <DirectionsBody
        cards={cards}
        disabled={disabled}
        error={directions.isError ? directions.error : undefined}
        loading={loading}
        onRetry={async () => {
          await directions.refetch();
        }}
        onUse={onUse}
        retrying={directions.isFetching}
        seconds={seconds}
        step={step}
        tavilyFailed={data?.tavilyFailed === true}
      />
      {data !== undefined && !data.hasBrand ? (
        <p className="text-muted-foreground text-xs">
          {t("brandHint")}{" "}
          <Link
            className="text-accent-text font-medium underline underline-offset-2"
            href="/dashboard/onboarding?step=brand"
          >
            {t("brandHintLink")}
          </Link>
        </p>
      ) : null}
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
