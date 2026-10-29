"use client";

import { useQuery } from "@tanstack/react-query";
import { Button } from "@wovain/ui/components/button";
import { Skeleton } from "@wovain/ui/components/skeleton";
import { MapPin, RefreshCw, Users } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useId } from "react";

import { orpc } from "@/utils/orpc";

const NOT_FOUND = 404;

const statusOf = (error: unknown) =>
  typeof error === "object" && error !== null && "status" in error
    ? (error as { status?: unknown }).status
    : undefined;

type WhoBuys = Awaited<ReturnType<typeof orpc.ideas.whoBuys.call>>;

/** One line: the age band(s) and the gender lean, from Qloo demographics. */
const BuyersLine = ({ buyers }: { buyers: WhoBuys["buyers"] }) => {
  const t = useTranslations("Wizard.whoBuys");
  const brand = useTranslations("Onboarding.brand");
  const ages = [buyers.age, buyers.nextAge]
    .filter((age) => age !== undefined)
    .map((age) => brand(`ages.${age}`));
  if (ages.length === 0 && buyers.gender === undefined) {
    return null;
  }
  return (
    <p className="text-sm">
      {t("buyers", {
        age: ages.length === 0 ? t("unknownAge") : ages.join(" / "),
        gender:
          buyers.gender === undefined
            ? t("unknownGender")
            : brand(`gender.${buyers.gender}`),
      })}
    </p>
  );
};

/** "Where your buyers are": Qloo's top cities with affinity bars. */
const Places = ({ places }: { places: WhoBuys["places"] }) => {
  const t = useTranslations("Wizard.whoBuys");
  const format = useFormatter();
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <h5 className="flex items-center gap-1.5 text-xs font-semibold" id={id}>
        <MapPin aria-hidden="true" className="size-3.5" />
        {t("where")}
      </h5>
      <ol aria-labelledby={id} className="flex flex-col gap-1">
        {places.map((place) => (
          <li
            className="grid grid-cols-[minmax(0,1fr)_6rem] items-center gap-3 text-xs"
            key={place.id}
            title={place.where}
          >
            <span className="truncate">
              {place.name}
              {place.country === undefined ? null : (
                <span className="text-muted-foreground">, {place.country}</span>
              )}
            </span>
            <span className="sr-only">
              {t("affinity", {
                value: format.number(place.affinity, { style: "percent" }),
              })}
            </span>
            <span
              aria-hidden="true"
              className="bg-muted h-1.5 overflow-hidden rounded-full"
            >
              <span
                className="bg-primary block h-full rounded-full"
                style={{ width: `${Math.round(place.affinity * 100)}%` }}
              />
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
};

/**
 * Who buys this idea and where, from Qloo alone, before any connector: the
 * age and gender lean, the Qloo audiences they belong to, the cities where
 * they are, and the fashion brands they already wear (data for targeting,
 * never put on a design).
 */
export const WhoBuysPanel = ({ ideaId }: { ideaId: string }) => {
  const t = useTranslations("Wizard.whoBuys");
  const headingId = useId();
  const query = useQuery(
    orpc.ideas.whoBuys.queryOptions({
      input: { ideaId },
      retry: false,
      staleTime: Number.POSITIVE_INFINITY,
    })
  );
  // The who-buys flag is off: nothing to show.
  if (query.isError && statusOf(query.error) === NOT_FOUND) {
    return null;
  }
  return (
    <section
      aria-labelledby={headingId}
      className="bg-muted/40 flex flex-col gap-3 rounded-lg p-3"
    >
      <h4
        className="flex items-center gap-1.5 text-xs font-semibold"
        id={headingId}
      >
        <Users aria-hidden="true" className="size-3.5" />
        {t("title")}
      </h4>
      {query.isError ? (
        <div className="flex flex-wrap items-center gap-2 text-xs" role="alert">
          <span className="text-muted-foreground">
            {query.error.message || t("failed")}
          </span>
          <Button
            disabled={query.isFetching}
            onClick={async () => {
              await query.refetch();
            }}
            size="sm"
            type="button"
            variant="outline"
          >
            <RefreshCw aria-hidden="true" data-icon="inline-start" />
            {t("retry")}
          </Button>
        </div>
      ) : null}
      {query.data === undefined && !query.isError ? (
        <div aria-busy="true" className="flex flex-col gap-2">
          <span className="text-muted-foreground text-xs">{t("loading")}</span>
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : null}
      {query.data === undefined ? null : (
        <>
          <BuyersLine buyers={query.data.buyers} />
          {query.data.audiences.length === 0 ? null : (
            <p className="text-xs">
              <span className="text-muted-foreground">{t("audiences")} </span>
              {query.data.audiences.map((one) => one.name).join(", ")}
            </p>
          )}
          {query.data.places.length === 0 ? null : (
            <Places places={query.data.places} />
          )}
          {query.data.brands.length === 0 ? null : (
            <p className="text-xs">
              <span className="text-muted-foreground">{t("brands")} </span>
              {query.data.brands.map((one) => one.name).join(", ")}
            </p>
          )}
          <p className="text-muted-foreground text-[0.7rem]">{t("source")}</p>
        </>
      )}
    </section>
  );
};
