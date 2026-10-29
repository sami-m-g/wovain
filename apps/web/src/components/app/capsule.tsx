"use client";

import type { InferRouterOutputs } from "@orpc/server";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AppRouter } from "@wovain/api/routers/index";
import { Badge } from "@wovain/ui/components/badge";
import { Button } from "@wovain/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@wovain/ui/components/card";
import { Skeleton } from "@wovain/ui/components/skeleton";
import { Check, CircleAlert, Layers } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useId, useState } from "react";

import { FlowProblemNotice } from "@/components/app/flow-problem";
import type { FlowProblem } from "@/lib/flow-client";
import { describeProblem } from "@/lib/flow-client";
import { orpc } from "@/utils/orpc";

type Outputs = InferRouterOutputs<AppRouter>;

// Capsules (openspec design-drops), a step of the new-drop flow: the picked
// idea becomes a capsule, each product gets its art, placements, mockups
// and price, and the whole capsule publishes through one approval.

type DropDetail = Outputs["drops"]["get"];
type DropItem = DropDetail["items"][number];

// A drop still building is polled until every product settles.
const POLL_MS = 5000;
const CENTS = 100;

const Swatches = ({ palette }: { palette: readonly string[] }) => (
  <span className="flex gap-1" aria-hidden="true">
    {palette.map((color) => (
      <span
        className="border-border size-4 rounded-full border"
        key={color}
        style={{ backgroundColor: color }}
      />
    ))}
  </span>
);

const Facts = ({ item }: { item: DropItem }) => {
  const t = useTranslations("Drops");
  const failed = item.placements.flatMap((piece) =>
    (piece.facts ?? [])
      .filter((fact) => !fact.pass)
      .map((fact) => ({ ...fact, region: piece.region }))
  );
  if (item.placements.every((piece) => piece.facts === undefined)) {
    return null;
  }
  return failed.length === 0 ? (
    <p className="text-muted-foreground flex items-center gap-1 text-xs">
      <Check aria-hidden="true" className="size-3" />
      {t("factsPass")}
    </p>
  ) : (
    <ul className="text-destructive space-y-1 text-xs">
      {failed.map((fact) => (
        <li className="flex gap-1" key={`${fact.region}-${fact.rule}`}>
          <CircleAlert aria-hidden="true" className="mt-0.5 size-3 shrink-0" />
          <span>
            {fact.region}: {fact.note}
          </span>
        </li>
      ))}
    </ul>
  );
};

const ItemCard = ({ item }: { item: DropItem }) => {
  const t = useTranslations("Drops");
  const format = useFormatter();
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="text-sm">{item.title}</CardTitle>
        <CardDescription>
          {item.blankName} · {t(`itemStatus.${item.status}`)}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {item.mockups !== undefined && item.mockups.length > 0 ? (
          <div className="grid grid-cols-2 gap-2">
            {item.mockups.map((url, index) => (
              // oxlint-disable-next-line nextjs/no-img-element -- Fourthwall's CDN mockups
              <img
                alt={t("mockupAlt", {
                  index: String(index + 1),
                  title: item.title,
                })}
                className="bg-muted aspect-square w-full rounded-md object-cover"
                height={240}
                key={url}
                loading="lazy"
                src={url}
                width={240}
              />
            ))}
          </div>
        ) : (
          <Skeleton className="aspect-square w-full" />
        )}
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          <dt className="text-muted-foreground">{t("placements")}</dt>
          <dd>
            {item.placements
              .map((piece) =>
                t("placement", {
                  art: t(`art.${piece.artType}`),
                  region: piece.placementId ?? piece.region,
                })
              )
              .join(", ")}
          </dd>
          <dt className="text-muted-foreground">{t("colors")}</dt>
          <dd>{item.colors.join(", ")}</dd>
          <dt className="text-muted-foreground">{t("sizes")}</dt>
          <dd>{item.sizes.join(", ")}</dd>
          {item.priceCents === null ? null : (
            <>
              <dt className="text-muted-foreground">{t("price")}</dt>
              <dd>
                {format.number(item.priceCents / CENTS, {
                  currency: "USD",
                  style: "currency",
                })}
                {item.cost === undefined
                  ? null
                  : ` · ${t(`costSource.${item.cost.source}`, {
                      cost: format.number(item.cost.dollars, {
                        currency: "USD",
                        style: "currency",
                      }),
                    })}`}
              </dd>
            </>
          )}
        </dl>
        <Facts item={item} />
        {item.error === undefined ? null : (
          <p className="text-destructive text-xs">{item.error}</p>
        )}
      </CardContent>
    </Card>
  );
};

const Review = ({ drop }: { drop: DropDetail["drop"] }) => {
  const t = useTranslations("Drops");
  if (drop.checks.length === 0) {
    return null;
  }
  const failed = drop.checks.filter((check) => !check.pass);
  return failed.length === 0 ? (
    <p className="text-muted-foreground text-sm">{t("reviewPass")}</p>
  ) : (
    <ul className="text-destructive space-y-1 text-sm">
      {failed.map((check) => (
        <li key={`${check.rule}-${check.position ?? "drop"}`}>{check.note}</li>
      ))}
    </ul>
  );
};

const DropView = ({ dropId }: { dropId: string }) => {
  const t = useTranslations("Drops");
  const queryClient = useQueryClient();
  const [problem, setProblem] = useState<FlowProblem | undefined>();
  const { data } = useQuery({
    ...orpc.drops.get.queryOptions({ input: { dropId } }),
    refetchInterval: (query) =>
      query.state.data?.items.some((item) => item.status === "draft") === true
        ? POLL_MS
        : false,
  });
  const refresh = async () =>
    await queryClient.invalidateQueries({ queryKey: orpc.drops.key() });
  const decide = useMutation(
    orpc.approvals.decide.mutationOptions({
      onError: (error) => setProblem(describeProblem(error)),
      onSuccess: refresh,
    })
  );
  const publish = useMutation(
    orpc.drops.publish.mutationOptions({
      onError: (error) => setProblem(describeProblem(error)),
      onSuccess: async (approval) => {
        if (approval.status === "pending") {
          decide.mutate({ approvalId: approval.id, approve: true });
          return;
        }
        await refresh();
      },
    })
  );
  if (data === undefined) {
    return <Skeleton className="h-64 w-full" />;
  }
  const { drop, items } = data;
  const building = items.some((item) => item.status === "draft");
  return (
    <section aria-labelledby={`drop-${drop.id}`} className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold" id={`drop-${drop.id}`}>
            {drop.name}
          </h2>
          <p className="text-muted-foreground flex flex-wrap items-center gap-2 text-sm">
            <Swatches palette={drop.palette} />
            <Badge variant="outline">{t(`family.${drop.styleFamily}`)}</Badge>
            <Badge variant="secondary">{t(`status.${drop.status}`)}</Badge>
          </p>
          <p className="text-muted-foreground text-sm">
            {drop.matched.length > 0
              ? t("chosenBy", { tags: drop.matched.join(", ") })
              : t("chosenByDefault")}
          </p>
        </div>
        {drop.status === "in_review" ? (
          <Button
            disabled={publish.isPending || decide.isPending}
            onClick={() => publish.mutate({ dropId: drop.id })}
          >
            {t("publish")}
          </Button>
        ) : null}
        {drop.status === "live" && drop.collectionSlug !== undefined ? (
          <Badge>{t("live", { slug: drop.collectionSlug })}</Badge>
        ) : null}
      </div>
      {problem === undefined ? null : (
        <FlowProblemNotice
          onDismiss={() => setProblem(undefined)}
          problem={problem}
        />
      )}
      {building ? (
        <output className="text-muted-foreground block text-sm">
          {t("building")}
        </output>
      ) : (
        <Review drop={drop} />
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <ItemCard item={item} key={item.id} />
        ))}
      </div>
    </section>
  );
};

const NOT_FOUND = 404;

const statusOf = (error: unknown) =>
  typeof error === "object" && error !== null && "status" in error
    ? (error as { status?: unknown }).status
    : undefined;

/**
 * "Make it a capsule", the step after the idea is picked (design-drops):
 * the picked idea becomes 4 to 6 products that share one palette and one
 * mark, built and published as one drop. Once planned, the capsule shows
 * here with its products and its publish button.
 */
export const CapsulePanel = ({
  ideaId,
  runId,
}: {
  ideaId: string | undefined;
  runId: string | undefined;
}) => {
  const t = useTranslations("Drops");
  const headingId = useId();
  const queryClient = useQueryClient();
  const [problem, setProblem] = useState<FlowProblem | undefined>();
  const drops = useQuery(orpc.drops.list.queryOptions({ retry: false }));
  const plan = useMutation(
    orpc.drops.plan.mutationOptions({
      onError: (error) => setProblem(describeProblem(error)),
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: orpc.drops.key() });
      },
    })
  );
  // The design-drops flag is off: no capsule step.
  if (
    runId === undefined ||
    (drops.isError && statusOf(drops.error) === NOT_FOUND)
  ) {
    return null;
  }
  const capsule = drops.data?.find((one) => one.runId === runId);
  return (
    <section
      aria-labelledby={headingId}
      className="border-border flex flex-col gap-4 rounded-xl border p-4"
    >
      <div className="flex flex-col gap-1">
        <h3
          className="flex items-center gap-2 text-sm font-semibold"
          id={headingId}
        >
          <Layers aria-hidden="true" className="size-4" />
          {t("capsuleTitle")}
        </h3>
        <p className="text-muted-foreground max-w-[65ch] text-sm">
          {t("intro")}
        </p>
      </div>
      {capsule === undefined ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            disabled={ideaId === undefined || plan.isPending || drops.isPending}
            onClick={() => {
              if (ideaId !== undefined) {
                plan.mutate({ ideaId });
              }
            }}
            type="button"
            variant="outline"
          >
            {t("plan")}
          </Button>
          {ideaId === undefined ? (
            <span className="text-muted-foreground text-sm">
              {t("capsulePick")}
            </span>
          ) : null}
        </div>
      ) : (
        <DropView dropId={capsule.id} />
      )}
      {problem === undefined ? null : (
        <FlowProblemNotice
          onDismiss={() => setProblem(undefined)}
          problem={problem}
        />
      )}
    </section>
  );
};
