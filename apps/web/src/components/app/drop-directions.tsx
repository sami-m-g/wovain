"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Button } from "@wovain/ui/components/button";
import { Label } from "@wovain/ui/components/label";
import { Skeleton } from "@wovain/ui/components/skeleton";
import { Switch } from "@wovain/ui/components/switch";
import { ArrowRight, RefreshCw, Shuffle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";

import { Citations } from "@/components/app/citations";
import { Link } from "@/i18n/navigation";
import { orpc } from "@/utils/orpc";

const NOT_FOUND = 404;
const SKELETON_ROWS = ["a", "b", "c"] as const;

const statusOf = (error: unknown) =>
  typeof error === "object" && error !== null && "status" in error
    ? (error as { status?: unknown }).status
    : undefined;

type Directions = Awaited<ReturnType<typeof orpc.runs.directions.call>>;
type Direction = Directions["directions"][number];

/** What backs a direction, in one line: who, what is rising, news, crowding. */
const EvidenceLine = ({ evidence }: { evidence: Direction["evidence"] }) => {
  const t = useTranslations("Wizard.directions");
  const { audience, momentum, rising, saturation } = evidence;
  const parts = [
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
      {momentum === undefined ? null : (
        <Citations
          citations={momentum.sources}
          label={t("sources", { title: direction.title })}
          max={3}
        />
      )}
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

/** The directions, or their loading, failure or empty state. */
const DirectionsBody = ({
  data,
  disabled,
  error,
  loading,
  onRetry,
  onUse,
  retrying,
}: {
  data: Directions | undefined;
  disabled: boolean;
  error: Error | undefined;
  loading: boolean;
  onRetry: () => Promise<void>;
  onUse: (brief: string) => void;
  retrying: boolean;
}) => {
  const t = useTranslations("Wizard.directions");
  return (
    <>
      {error === undefined ? null : (
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
      )}
      {loading ? (
        <div aria-busy="true" className="flex flex-col gap-2">
          <span className="sr-only">{t("loading")}</span>
          {SKELETON_ROWS.map((key) => (
            <Skeleton className="h-24 rounded-xl" key={key} />
          ))}
        </div>
      ) : null}
      {!loading && data?.directions.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("none")}</p>
      ) : null}
      {!loading && data !== undefined && data.directions.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {data.directions.map((direction) => (
            <DirectionRow
              direction={direction}
              disabled={disabled}
              key={direction.key}
              onUse={onUse}
            />
          ))}
        </ul>
      ) : null}
      {!loading && data?.tavilyFailed ? (
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
  const directions = useQuery(
    orpc.runs.directions.queryOptions({
      input: { ignoreBrand, round },
      placeholderData: keepPreviousData,
      retry: false,
      staleTime: Number.POSITIVE_INFINITY,
    })
  );
  // The drop-directions flag is off: nothing to show.
  if (directions.isError && statusOf(directions.error) === NOT_FOUND) {
    return null;
  }
  const { data } = directions;
  const loading =
    !directions.isError && (data === undefined || directions.isPlaceholderData);
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
        data={data}
        disabled={disabled}
        error={directions.isError ? directions.error : undefined}
        loading={loading}
        onRetry={async () => {
          await directions.refetch();
        }}
        onUse={onUse}
        retrying={directions.isFetching}
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
