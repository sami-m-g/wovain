"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@wovain/ui/components/alert";
import { Badge } from "@wovain/ui/components/badge";
import { Button } from "@wovain/ui/components/button";
import { RotateCcw } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";

import { Citations } from "@/components/app/citations";
import type { Campaign, Idea } from "@/lib/flow-client";
import { orpc } from "@/utils/orpc";

// The competitive landscape of a theme (the tavily-competition flag): how
// crowded it is, how near-identical shirts sell and what the audience likes
// that they miss, each point with the page it came from. Shown on the idea
// card and with a campaign's ads. A failed read says "competition unknown"
// and offers to check again.

type Competition = NonNullable<Idea["competition"]>;
type PointKind = Competition["points"][number]["kind"];

const KINDS: readonly PointKind[] = [
  "hook",
  "claim",
  "title",
  "style",
  "price",
  "complaint",
];

const LevelBadge = ({ competition }: { competition: Competition }) => {
  const t = useTranslations("Wizard.competition");
  if (
    competition.status === "unknown" ||
    competition.saturation === undefined
  ) {
    return <Badge variant="destructive">{t("unknown")}</Badge>;
  }
  const { level } = competition.saturation;
  return (
    <Badge variant={level === "high" ? "destructive" : "secondary"}>
      {t(`level.${level}`)}
    </Badge>
  );
};

const CompetitionView = ({ competition }: { competition: Competition }) => {
  const t = useTranslations("Wizard.competition");
  const format = useFormatter();
  const { failed, gaps, points, prices, saturation } = competition;
  return (
    <div className="flex flex-col gap-2 text-xs">
      {saturation === undefined ? null : (
        <div className="flex flex-col gap-1">
          <span>
            {t("count", {
              count: saturation.count,
              sampled: saturation.sampled,
            })}
          </span>
          <Citations
            citations={saturation.listings}
            label={t("listings")}
            max={5}
          />
        </div>
      )}
      {competition.saturated ? (
        <Alert variant="destructive">
          <AlertTitle>{t("saturatedTitle")}</AlertTitle>
          <AlertDescription>
            {competition.skipped ?? t("saturated")}
          </AlertDescription>
        </Alert>
      ) : null}
      {prices?.median === undefined ? null : (
        <div className="flex flex-col gap-1">
          <span>
            {t("price", {
              price: format.number(prices.median, {
                currency: "USD",
                style: "currency",
              }),
            })}
          </span>
          <Citations citations={prices.citations} max={3} />
        </div>
      )}
      {KINDS.map((kind) => {
        const ofKind = points.filter((point) => point.kind === kind);
        if (ofKind.length === 0) {
          return null;
        }
        return (
          <section className="flex flex-col gap-1" key={kind}>
            <h5 className="text-muted-foreground font-medium">
              {t(`kind.${kind}`)}
            </h5>
            <ul className="flex flex-col gap-1">
              {ofKind.map((point) => (
                <li
                  className="flex flex-wrap items-center gap-x-2"
                  key={`${point.source.url}:${point.text}`}
                >
                  <span>{point.text}</span>
                  <Citations citations={[point.source]} max={1} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {gaps.length === 0 ? null : (
        <section className="flex flex-col gap-1">
          <h5 className="text-muted-foreground font-medium">{t("gaps")}</h5>
          <p className="flex flex-wrap gap-1">
            {gaps.map((gap) => (
              <Badge key={gap.cue} variant="outline">
                {gap.cue}
              </Badge>
            ))}
          </p>
        </section>
      )}
      {failed.length === 0 ? null : (
        <p className="text-muted-foreground">
          {t("partial", { steps: failed.join(", ") })}
        </p>
      )}
    </div>
  );
};

// On an idea card: the saved read, and "check again" when it failed.
export const IdeaCompetition = ({
  competition,
  ideaId,
}: {
  competition: Idea["competition"];
  ideaId: string;
}) => {
  const t = useTranslations("Wizard.competition");
  const [current, setCurrent] = useState(competition);
  const again = useMutation(orpc.ideas.competition.mutationOptions());
  if (current === null) {
    return null;
  }
  const onAgain = async () => {
    setCurrent(await again.mutateAsync({ ideaId }));
  };
  return (
    <section
      aria-label={t("title")}
      className="flex flex-col gap-2 rounded-md border p-3"
    >
      <h4 className="flex items-center gap-2 text-xs font-semibold">
        {t("title")}
        <LevelBadge competition={current} />
      </h4>
      {current.status === "unknown" ? (
        <div className="flex flex-col items-start gap-2 text-xs">
          <span>{t("unknownHint", { reason: current.error ?? "" })}</span>
          <Button
            className="h-8 px-3"
            disabled={again.isPending}
            onClick={() => {
              void onAgain();
            }}
            variant="outline"
          >
            <RotateCcw aria-hidden="true" data-icon="inline-start" />
            {t("again")}
          </Button>
          {again.error === null ? null : (
            <p className="text-destructive" role="alert">
              {again.error.message}
            </p>
          )}
        </div>
      ) : (
        <CompetitionView competition={current} />
      )}
    </section>
  );
};

// With a campaign's ads: the competition the copy was written against.
export const CampaignCompetition = ({ campaign }: { campaign: Campaign }) => {
  const t = useTranslations("Wizard.competition");
  const read = useQuery({
    ...orpc.campaigns.competition.queryOptions({
      input: { campaignId: campaign.id },
    }),
    // Off (404) or not read: nothing to show.
    retry: false,
  });
  const competition = read.data;
  if (competition === undefined || competition === null) {
    return null;
  }
  return (
    <section
      aria-label={t("adsTitle")}
      className="flex flex-col gap-2 rounded-md border p-3"
    >
      <h4 className="flex items-center gap-2 text-xs font-semibold">
        {t("adsTitle")}
        <LevelBadge competition={competition} />
      </h4>
      {competition.status === "unknown" ? (
        <p className="text-xs">
          {t("unknownHint", { reason: competition.error ?? "" })}
        </p>
      ) : (
        <CompetitionView competition={competition} />
      )}
    </section>
  );
};
