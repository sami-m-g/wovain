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
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@wovain/ui/components/empty";
import { Skeleton } from "@wovain/ui/components/skeleton";
import { Check, CircleAlert, Layers } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useId, useState } from "react";

import { FlowProblemNotice } from "@/components/app/flow-problem";
import type { FlowProblem } from "@/lib/flow-client";
import { describeProblem } from "@/lib/flow-client";
import { orpc } from "@/utils/orpc";

type Outputs = InferRouterOutputs<AppRouter>;

// Drops (openspec design-drops): plan a capsule from an idea, watch each
// product get its art, placements, mockups and price, and publish the
// whole capsule through one approval.

type DropDetail = Outputs["drops"]["get"];
type DropItem = DropDetail["items"][number];
type DropSummary = Outputs["drops"]["list"][number];

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

const PlanForm = ({ onPlanned }: { onPlanned: (id: string) => void }) => {
  const t = useTranslations("Drops");
  const selectId = useId();
  const ideas = useQuery(orpc.ideas.list.queryOptions({ input: {} }));
  const [ideaId, setIdeaId] = useState("");
  const [problem, setProblem] = useState<FlowProblem | undefined>();
  const queryClient = useQueryClient();
  const plan = useMutation(
    orpc.drops.plan.mutationOptions({
      onError: (error) => setProblem(describeProblem(error)),
      onSuccess: async (row) => {
        await queryClient.invalidateQueries({ queryKey: orpc.drops.key() });
        onPlanned(row.id);
      },
    })
  );
  const options = ideas.data ?? [];
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("planTitle")}</CardTitle>
        <CardDescription>{t("planIntro")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {options.length === 0 && !ideas.isPending ? (
          <p className="text-muted-foreground text-sm">{t("noIdeas")}</p>
        ) : (
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (ideaId !== "") {
                plan.mutate({ ideaId });
              }
            }}
          >
            <div className="flex min-w-60 flex-1 flex-col gap-1">
              <label className="text-sm font-medium" htmlFor={selectId}>
                {t("ideaLabel")}
              </label>
              <select
                className="border-input bg-background h-9 rounded-md border px-2 text-sm"
                id={selectId}
                onChange={(event) => setIdeaId(event.target.value)}
                value={ideaId}
              >
                <option value="">{t("ideaPlaceholder")}</option>
                {options.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.theme}
                  </option>
                ))}
              </select>
            </div>
            <Button disabled={ideaId === "" || plan.isPending} type="submit">
              {plan.isPending ? t("planning") : t("plan")}
            </Button>
          </form>
        )}
        {problem === undefined ? null : (
          <FlowProblemNotice
            onDismiss={() => setProblem(undefined)}
            problem={problem}
          />
        )}
      </CardContent>
    </Card>
  );
};

const DropList = ({
  drops,
  onOpen,
  open,
}: {
  drops: readonly DropSummary[];
  onOpen: (id: string) => void;
  open: string | undefined;
}) => {
  const t = useTranslations("Drops");
  return (
    <nav aria-label={t("listLabel")} className="flex flex-wrap gap-2">
      {drops.map((drop) => (
        <Button
          aria-current={drop.id === open ? "true" : undefined}
          key={drop.id}
          onClick={() => onOpen(drop.id)}
          size="sm"
          variant={drop.id === open ? "default" : "outline"}
        >
          <Swatches palette={drop.palette.slice(0, 3)} />
          {drop.name}
        </Button>
      ))}
    </nav>
  );
};

export const DropsBoard = () => {
  const t = useTranslations("Drops");
  const drops = useQuery(orpc.drops.list.queryOptions());
  const [open, setOpen] = useState<string | undefined>();
  const shown = open ?? drops.data?.[0]?.id;
  return (
    <div className="space-y-6">
      <PlanForm onPlanned={setOpen} />
      {drops.data !== undefined && drops.data.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <Layers aria-hidden="true" />
            <EmptyTitle>{t("emptyTitle")}</EmptyTitle>
            <EmptyDescription>{t("emptyBody")}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}
      {drops.data !== undefined && drops.data.length > 0 ? (
        <DropList drops={drops.data} onOpen={setOpen} open={shown} />
      ) : null}
      {shown === undefined ? null : <DropView dropId={shown} />}
    </div>
  );
};
