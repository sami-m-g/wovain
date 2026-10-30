"use client";

import type {
  CompetitionLevel,
  Field,
  IdeaAudience,
  IdeaCard,
  IdeaCompetition,
  IdeaMake,
  IdeaWhy,
  UnavailableReason,
} from "@wovain/core/idea-card";
import { Badge } from "@wovain/ui/components/badge";
import { ExternalLink } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import type { ReactNode } from "react";

import type { QlooEvidence } from "@/components/drops/decided-by-qloo";
import { DecidedByQloo } from "@/components/drops/decided-by-qloo";

const MAX_CITATIONS = 3;
const MAX_NAMES = 3;

const LEVEL_VARIANT: Record<
  CompetitionLevel,
  "default" | "secondary" | "destructive"
> = {
  crowded: "destructive",
  open: "secondary",
  "sweet-spot": "default",
};

/** "Not available: <reason>": a section never vanishes without saying why. */
const Unavailable = ({ reason }: { reason: UnavailableReason }) => {
  const t = useTranslations("IdeaCard");
  return (
    <p className="text-muted-foreground text-sm">
      {t("unavailable", { reason: t(`reasons.${reason}`) })}
    </p>
  );
};

/** One of the card's four sections: always present, in the same place. */
const CardSection = <T,>({
  children,
  field,
  notRead,
  title,
}: {
  children: (value: T) => ReactNode;
  field: Field<T>;
  // What reads the section on demand, while it is not read yet.
  notRead?: ReactNode;
  title: string;
}) => (
  <section className="border-border flex flex-col gap-1.5 border-t pt-3">
    <h4 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
      {title}
    </h4>
    {/* A section read on demand shows its button, not "Not available". */}
    {field.status === "ok"
      ? children(field.value)
      : ((field.reason === "not_read" ? notRead : undefined) ?? (
          <Unavailable reason={field.reason} />
        ))}
  </section>
);

const Citations = ({
  citations,
}: {
  citations: readonly { title: string; url: string }[];
}) =>
  citations.length === 0 ? null : (
    <ol className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
      {citations.slice(0, MAX_CITATIONS).map((citation, index) => (
        <li key={citation.url}>
          <a
            className="text-accent-text inline-flex min-h-6 max-w-56 items-center gap-1 font-semibold underline"
            href={citation.url}
            rel="noopener noreferrer"
            target="_blank"
          >
            <span className="figures">[{index + 1}]</span>
            <span className="truncate">{citation.title}</span>
            <ExternalLink aria-hidden="true" className="size-3 shrink-0" />
          </a>
        </li>
      ))}
    </ol>
  );

const Make = ({ make }: { make: IdeaMake }) => {
  const t = useTranslations("IdeaCard.make");
  return (
    <>
      <p className="text-sm">{make.concept}</p>
      <p className="text-muted-foreground text-xs">
        {[
          make.products.length > 0
            ? t("products", { products: make.products.join(", ") })
            : undefined,
          make.style ? t("style", { style: make.style }) : undefined,
          make.buyer,
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
    </>
  );
};

const Why = ({ why }: { why: IdeaWhy }) => {
  const t = useTranslations("IdeaCard.why");
  const reasons = useTranslations("IdeaCard.reasons");
  const format = useFormatter();
  const { demand } = why;
  return (
    <>
      {why.sentence ? <p className="text-sm">{why.sentence}</p> : null}
      <ul className="text-muted-foreground flex flex-col gap-0.5 text-xs">
        <li>
          {t("affinity", {
            affinity: format.number(why.affinity, {
              maximumFractionDigits: 2,
            }),
            tag: why.qlooTag.name,
          })}
        </li>
        {/* The Qloo audience and its rising artists and shows behind the
            idea, on the card and not only in the Decided by Qloo mark. */}
        {why.qloo.audience === undefined ? null : (
          <li>{t("audience", { audience: why.qloo.audience })}</li>
        )}
        {why.qloo.entities.length === 0 ? null : (
          <li>
            {t("rising", {
              names: why.qloo.entities.map((one) => one.name).join(", "),
            })}
          </li>
        )}
        {why.trend === undefined ? null : (
          <li>{t("news", { count: why.trend.news })}</li>
        )}
        {demand.status === "ok" ? (
          <>
            <li>
              {demand.value.market.status === "ok"
                ? t("market", {
                    bestsellers: demand.value.market.value.bestsellers,
                    reviews: demand.value.market.value.reviews,
                  })
                : t("marketMissing", {
                    reason: reasons(demand.value.market.reason),
                  })}
            </li>
            <li>
              {demand.value.ads.status === "ok"
                ? t("ads", {
                    advertisers: demand.value.ads.value.advertisers,
                    validated: demand.value.ads.value.validated,
                  })
                : t("adsMissing", {
                    reason: reasons(demand.value.ads.reason),
                  })}
            </li>
          </>
        ) : (
          <li>{t("demandMissing", { reason: reasons(demand.reason) })}</li>
        )}
      </ul>
      <Citations citations={why.citations} />
    </>
  );
};

const Audience = ({ audience }: { audience: IdeaAudience }) => {
  const t = useTranslations("IdeaCard.audience");
  const fromBrief = audience.agesScope === "brief";
  return (
    <>
      {audience.scope === "brief" ? (
        <p className="text-muted-foreground text-xs">{t("sameAsBrief")}</p>
      ) : null}
      <p className="text-sm">
        {audience.ages.length > 0 ? audience.ages.join(" / ") : t("noAges")}
        {audience.gender ? ` · ${audience.gender}` : ""}
        {fromBrief ? (
          <span className="text-muted-foreground"> ({t("fromBrief")})</span>
        ) : null}
      </p>
      {audience.places.length > 0 ? (
        <p className="text-muted-foreground text-xs">
          {t("places", {
            places: audience.places
              .slice(0, MAX_NAMES)
              .map((place) => place.name)
              .join(", "),
          })}
        </p>
      ) : null}
      {audience.interests.length > 0 ? (
        <p className="text-muted-foreground text-xs">
          {t("interests", {
            interests: audience.interests.slice(0, MAX_NAMES).join(", "),
          })}
        </p>
      ) : null}
      <p className="text-muted-foreground text-[0.7rem]">{t("source")}</p>
    </>
  );
};

const Competition = ({ competition }: { competition: IdeaCompetition }) => {
  const t = useTranslations("IdeaCard.competition");
  const format = useFormatter();
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={LEVEL_VARIANT[competition.level]}>
          {t(`level.${competition.level}`)}
        </Badge>
        <span className="text-sm">
          {competition.sampled === undefined
            ? t("listings", { count: competition.listings })
            : t("listingsOf", {
                count: competition.listings,
                sampled: competition.sampled,
              })}
        </span>
      </div>
      <p className="text-muted-foreground text-xs">
        {competition.medianPrice === undefined
          ? t("noPrice")
          : t("medianPrice", {
              price: format.number(competition.medianPrice, {
                currency: "USD",
                style: "currency",
              }),
            })}
        {competition.advertisers === undefined
          ? ""
          : ` · ${t("advertisers", { count: competition.advertisers })}`}
      </p>
      {competition.gaps.length > 0 ? (
        <p className="text-muted-foreground text-xs">
          {t("gaps", {
            gaps: competition.gaps.slice(0, MAX_NAMES).join(", "),
          })}
        </p>
      ) : null}
      <Citations citations={competition.citations} />
    </>
  );
};

/** What Qloo decided about this idea, for the Decided by Qloo mark. */
const useQlooMark = (why: Field<IdeaWhy>, audience: Field<IdeaAudience>) => {
  const t = useTranslations("IdeaCard.mark");
  const format = useFormatter();
  if (why.status !== "ok") {
    return;
  }
  const { qloo, qlooTag } = why.value;
  const evidence: QlooEvidence[] = [
    { label: t("tag"), value: qlooTag.name },
    {
      label: t("affinity"),
      value: format.number(qloo.affinity, { maximumFractionDigits: 2 }),
    },
    ...(qloo.audience === undefined
      ? []
      : [{ label: t("audience"), value: qloo.audience }]),
    ...(qloo.entities.length > 0
      ? [
          {
            label: t("entities"),
            value: qloo.entities.map((one) => one.name).join(", "),
          },
        ]
      : []),
    ...(audience.status === "ok" && audience.value.places.length > 0
      ? [
          {
            label: t("places"),
            value: audience.value.places
              .slice(0, MAX_NAMES)
              .map((place) => place.name)
              .join(", "),
          },
        ]
      : []),
  ];
  return {
    decision: t("decision", { tag: qlooTag.name }),
    evidence,
  };
};

/**
 * The one idea card (openspec story-ui, idea-evidence): what to make, why
 * it sells, who buys and where, and competition, always in that order. A
 * section without data says why. `children` goes under the sections (the
 * pick, research and style controls of the step that shows the card).
 */
export const IdeaCardView = ({
  card,
  children,
  heading: Heading = "h3",
  lead,
  readAudience,
  titleFor,
}: {
  card: IdeaCard;
  children?: ReactNode;
  heading?: "h3" | "h4";
  // Above the title: a checkbox, a rank.
  lead?: ReactNode;
  // Who buys is read on demand: what reads it while it is not read yet.
  readAudience?: ReactNode;
  // The id of the lead's control: the title selects it too.
  titleFor?: string;
}) => {
  const t = useTranslations("IdeaCard");
  const mark = useQlooMark(card.why, card.audience);
  const tag = card.why.status === "ok" ? card.why.value.qlooTag.name : "";
  const title =
    card.make.status === "ok" ? card.make.value.title : t("tagTitle", { tag });
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          {lead}
          <Heading className="text-base font-semibold text-pretty">
            {titleFor === undefined ? (
              title
            ) : (
              <label className="block cursor-pointer py-2" htmlFor={titleFor}>
                {title}
              </label>
            )}
          </Heading>
        </div>
        {mark === undefined ? null : (
          <DecidedByQloo decision={mark.decision} evidence={mark.evidence} />
        )}
      </div>
      <CardSection field={card.make} title={t("sections.make")}>
        {(make) => <Make make={make} />}
      </CardSection>
      <CardSection field={card.why} title={t("sections.why")}>
        {(why) => <Why why={why} />}
      </CardSection>
      <CardSection
        field={card.audience}
        notRead={readAudience}
        title={t("sections.audience")}
      >
        {(audience) => <Audience audience={audience} />}
      </CardSection>
      <CardSection field={card.competition} title={t("sections.competition")}>
        {(competition) => <Competition competition={competition} />}
      </CardSection>
      {children}
    </div>
  );
};
