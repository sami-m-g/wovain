"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

import type { QlooEvidence } from "@/components/drops/decided-by-qloo";
import { DecidedByQloo } from "@/components/drops/decided-by-qloo";
import { orpc } from "@/utils/orpc";

const MAX_NAMES = 3;
// Campaigns are staged for these countries unless the merchant says otherwise.
const DEFAULT_COUNTRIES = ["US"];

const names = (items: readonly { name: string }[]) =>
  items
    .slice(0, MAX_NAMES)
    .map((item) => item.name)
    .join(", ");

/** Qloo's audience as Meta targeting: what the campaign reaches. */
const useTargetingEvidence = (): QlooEvidence[] | undefined => {
  const t = useTranslations("DropStory.campaign");
  const preview = useQuery({
    ...orpc.targeting.preview.queryOptions({
      input: { countries: DEFAULT_COUNTRIES },
    }),
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });
  if (preview.data === undefined) {
    return undefined;
  }
  const { evidence } = preview.data;
  return [
    ...(evidence.audiences.length > 0
      ? [{ label: t("audiences"), value: names(evidence.audiences) }]
      : []),
    ...(evidence.interests.length > 0
      ? [
          {
            label: t("interests"),
            value: names(
              evidence.interests.map((one) => ({ name: one.metaName }))
            ),
          },
        ]
      : []),
    ...(evidence.age === undefined
      ? []
      : [
          {
            label: t("agesLabel"),
            value: t("ages", { max: evidence.age.max, min: evidence.age.min }),
          },
        ]),
  ];
};

/** The "Decided by Qloo" mark on the drop page's campaign section. */
export const TargetingMark = () => {
  const t = useTranslations("DropStory.campaign");
  const evidence = useTargetingEvidence();
  return evidence === undefined ? null : (
    <DecidedByQloo decision={t("decision")} evidence={evidence} />
  );
};

/**
 * Who the campaign reaches, in the open: Qloo's audiences, interests and
 * ages, under `title`. Nothing until Qloo has an answer.
 */
export const CampaignAudience = ({ title }: { title: string }) => {
  const t = useTranslations("DropStory.campaign");
  const evidence = useTargetingEvidence();
  if (evidence === undefined || evidence.length === 0) {
    return null;
  }
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        <DecidedByQloo decision={t("decision")} evidence={evidence} />
      </div>
      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
        {evidence.map((item) => (
          <div className="flex flex-col gap-0.5" key={item.label}>
            <dt className="text-muted-foreground text-xs">{item.label}</dt>
            <dd>{item.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
};
