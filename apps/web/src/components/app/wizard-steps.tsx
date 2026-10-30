"use client";

import { useQuery } from "@tanstack/react-query";
import { checkPrice } from "@wovain/core/price-check";
import { Alert, AlertDescription } from "@wovain/ui/components/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@wovain/ui/components/alert-dialog";
import { Badge } from "@wovain/ui/components/badge";
import { Button, buttonVariants } from "@wovain/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@wovain/ui/components/card";
import { Checkbox } from "@wovain/ui/components/checkbox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from "@wovain/ui/components/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
  InputGroupTextarea,
} from "@wovain/ui/components/input-group";
import { Skeleton } from "@wovain/ui/components/skeleton";
import { Textarea } from "@wovain/ui/components/textarea";
import { cn } from "@wovain/ui/lib/utils";
import {
  Check,
  CircleAlert,
  ExternalLink,
  RotateCcw,
  Upload,
  X,
} from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import Image from "next/image";
import { useId, useState } from "react";

import { BriefStarters } from "@/components/app/brief-starters";
import { CapsulePanel } from "@/components/app/capsule";
import { Citations } from "@/components/app/citations";
import { IdeaCompetition } from "@/components/app/competition-panel";
import { DesignPreview } from "@/components/app/design-preview";
import { DictationMic } from "@/components/app/dictation-mic";
import { DropStylePanel } from "@/components/app/drop-style-panel";
import { IdeaDossier } from "@/components/app/idea-dossier";
import { TasteMapPanel } from "@/components/app/taste-map";
import { WhoBuysPanel } from "@/components/app/who-buys";
import {
  NextButton,
  StepActions,
  StepHeader,
} from "@/components/app/wizard-parts";
import { IdeaCardView } from "@/components/ideas/idea-card-view";
import { ReadinessGate } from "@/components/store/store-summary";
import type { Design, Idea, Product } from "@/lib/flow-client";
import { namedWords } from "@/lib/flow-client";
import { orpc } from "@/utils/orpc";

const IMAGE_SIZE = 640;

// The products step's badge per product status: live, else hidden. A
// product queued for review before the in-flow publish is a draft too.
const STATUS_KEY: Partial<Record<Product["status"], "public" | "hidden">> = {
  public: "public",
};
export const MAX_BRIEF = 200;
const MIN_BUDGET = 1;
const MAX_BUDGET = 500;

export const useMoney = () => {
  const format = useFormatter();
  return (value: number) =>
    format.number(value, { currency: "USD", style: "currency" });
};

export const BudgetField = ({
  budget,
  invalid,
  onBudget,
}: {
  budget: string;
  invalid: boolean;
  onBudget: (value: string) => void;
}) => {
  const t = useTranslations("Wizard.campaign");
  const id = useId();
  return (
    <Field className="max-w-xs" data-invalid={invalid || undefined}>
      <FieldLabel htmlFor={id}>{t("budgetLabel")}</FieldLabel>
      <InputGroup className="h-10">
        <InputGroupAddon>
          <InputGroupText>$</InputGroupText>
        </InputGroupAddon>
        <InputGroupInput
          aria-describedby={`${id}-hint`}
          aria-invalid={invalid || undefined}
          className="figures text-base md:text-sm"
          id={id}
          inputMode="decimal"
          max={MAX_BUDGET}
          min={MIN_BUDGET}
          onChange={(event) => onBudget(event.target.value)}
          step="1"
          type="number"
          value={budget}
        />
        <InputGroupAddon align="inline-end">
          <InputGroupText>{t("perDay")}</InputGroupText>
        </InputGroupAddon>
      </InputGroup>
      <FieldDescription id={`${id}-hint`}>{t("budgetHint")}</FieldDescription>
      {invalid ? <FieldError>{t("budgetError")}</FieldError> : null}
    </Field>
  );
};

export const BriefStep = ({
  brief,
  error,
  autopilot,
  budget,
  budgetInvalid,
  busyLabel,
  onChange,
  onBudget,
  onSubmit,
}: {
  brief: string;
  error?: string | undefined;
  autopilot: boolean;
  budget: string;
  budgetInvalid: boolean;
  busyLabel?: string | undefined;
  onChange: (value: string) => void;
  onBudget: (value: string) => void;
  onSubmit: () => void;
}) => {
  const t = useTranslations("Wizard.brief");
  const format = useFormatter();
  const id = useId();
  return (
    <form
      className="flex flex-col gap-6"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <StepHeader focusOnMount={false} title={t("title")} />
      {/* One place to write (here) and one to pick a researched idea (the
          Home): starters only fill the box. */}
      <Field data-invalid={error ? true : undefined}>
        <FieldLabel htmlFor={id}>{t("label")}</FieldLabel>
        <InputGroup>
          <InputGroupTextarea
            aria-describedby={`${id}-hint`}
            aria-invalid={error ? true : undefined}
            className="min-h-28 text-base md:text-sm"
            id={id}
            maxLength={MAX_BRIEF}
            onChange={(event) => onChange(event.target.value)}
            placeholder={t("placeholder")}
            required
            value={brief}
          />
          <InputGroupAddon align="block-end" className="justify-between">
            <DictationMic
              field={id}
              label={t("label")}
              maxLength={MAX_BRIEF}
              onText={onChange}
            />
            <InputGroupText aria-hidden="true" className="figures text-xs">
              {format.number(brief.length)}/{format.number(MAX_BRIEF)}
            </InputGroupText>
          </InputGroupAddon>
        </InputGroup>
        <FieldDescription id={`${id}-hint`}>{t("hint")}</FieldDescription>
        {error ? <FieldError>{error}</FieldError> : null}
      </Field>
      <BriefStarters disabled={Boolean(busyLabel)} onPick={onChange} />
      {autopilot ? (
        <BudgetField
          budget={budget}
          invalid={budgetInvalid}
          onBudget={onBudget}
        />
      ) : null}
      <StepActions busyLabel={busyLabel}>
        <NextButton disabled={Boolean(busyLabel)} type="submit">
          {autopilot ? t("submitAutopilot") : t("submit")}
        </NextButton>
      </StepActions>
    </form>
  );
};

const Signal = ({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string | undefined;
}) => (
  <div className="bg-muted rounded-md p-2" title={hint}>
    <dt className="text-muted-foreground">{label}</dt>
    <dd className="figures font-semibold">{value}</dd>
  </div>
);

// What competitors charge, read off their listings, and any search that
// failed for this idea: the evidence behind the margin and the listings
// count.
const IdeaEvidence = ({ research }: { research: Idea["research"] }) => {
  const t = useTranslations("Wizard.evidence");
  const format = useFormatter();
  const { failedSearches = [], prices } = research;
  const extracted =
    prices?.source === "extract" && prices.median !== undefined
      ? prices
      : undefined;
  if (extracted === undefined && failedSearches.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-col gap-1 px-1 text-xs">
      {extracted === undefined ? null : (
        <>
          <p className="text-muted-foreground">
            {t("competitorPrice", {
              count: extracted.count,
              price: format.number(extracted.median ?? 0, {
                currency: "USD",
                style: "currency",
              }),
            })}
          </p>
          <Citations citations={extracted.citations} />
        </>
      )}
      {failedSearches.map((kind) => (
        <p className="text-muted-foreground" key={kind}>
          {kind === "news" ? t("newsFailed") : t("marketFailed")}
        </p>
      ))}
    </div>
  );
};

export const IdeasStep = ({
  ideas,
  picked,
  designedIdeaIds,
  busyLabel,
  onToggle,
  onNext,
  runId,
  story = false,
}: {
  ideas: Idea[];
  picked: string[];
  // The story-ui flag: every idea as the one fixed idea card.
  story?: boolean;
  // The drop's run, for the capsule step.
  runId?: string | undefined;
  designedIdeaIds: string[];
  busyLabel?: string | undefined;
  onToggle: (id: string, checked: boolean) => void;
  onNext: () => void;
}) => {
  const t = useTranslations("Wizard.trends");
  const tCard = useTranslations("IdeaCard");
  const format = useFormatter();
  const id = useId();
  const decimal = (value: number) =>
    format.number(value, {
      maximumFractionDigits: 2,
      minimumFractionDigits: 2,
    });
  return (
    <div className="flex flex-col gap-6">
      <StepHeader lead={t("lead")} title={t("title")} />
      {ideas.length > 0 &&
      ideas.every((idea) => idea.research.caution !== undefined) ? (
        <p className="text-muted-foreground text-sm">{tCard("unconfirmed")}</p>
      ) : null}
      <FieldSet>
        <FieldLegend className="sr-only">{t("title")}</FieldLegend>
        <ul className="grid gap-3 md:grid-cols-2">
          {ideas.map((idea) => {
            const designed = designedIdeaIds.includes(idea.id);
            const checked = designed || picked.includes(idea.id);
            const checkboxId = `${id}-${idea.id}`;
            const { research } = idea;
            if (story) {
              return (
                <li
                  className="border-border bg-card has-data-checked:border-primary/60 flex flex-col rounded-xl border p-4"
                  key={idea.id}
                >
                  <IdeaCardView
                    card={idea.card}
                    readAudience={<WhoBuysPanel ideaId={idea.id} />}
                    titleFor={checkboxId}
                    lead={
                      <Checkbox
                        aria-label={t("pickIdea", {
                          title:
                            idea.card.make.status === "ok"
                              ? idea.card.make.value.title
                              : idea.theme,
                        })}
                        checked={checked}
                        className="mt-0.5"
                        disabled={designed}
                        id={checkboxId}
                        onCheckedChange={(next) => onToggle(idea.id, next)}
                      />
                    }
                  >
                    {research.caution === undefined ? null : (
                      <p className="text-muted-foreground text-xs">
                        {tCard(`caution.${research.caution}`)}
                      </p>
                    )}
                    {designed ? (
                      <Badge className="w-fit" variant="secondary">
                        {t("hasDesign")}
                      </Badge>
                    ) : null}
                    {checked && !designed ? (
                      <DropStylePanel ideaId={idea.id} />
                    ) : null}
                    <IdeaDossier ideaId={idea.id} />
                  </IdeaCardView>
                </li>
              );
            }
            const words = namedWords(idea);
            return (
              <li className="flex flex-col gap-2" key={idea.id}>
                {/* shadcn's choice card: the whole card is the label. */}
                <FieldLabel className="h-full" htmlFor={checkboxId}>
                  <Field className="h-full p-4!" orientation="horizontal">
                    <Checkbox
                      checked={checked}
                      disabled={designed}
                      id={checkboxId}
                      onCheckedChange={(next) => onToggle(idea.id, next)}
                    />
                    <FieldContent className="gap-3">
                      <FieldTitle className="text-base">
                        {words?.title}
                        {designed ? (
                          <Badge variant="secondary">{t("hasDesign")}</Badge>
                        ) : null}
                      </FieldTitle>
                      <span className="text-muted-foreground figures text-xs font-medium">
                        {t("score", { score: decimal(idea.score) })}
                      </span>
                      {research.caution === undefined ? null : (
                        <span className="text-muted-foreground text-xs">
                          {tCard(`caution.${research.caution}`)}
                        </span>
                      )}
                      {words ? (
                        <FieldDescription className="text-foreground line-clamp-4">
                          {words.concept} {words.whyNow}
                        </FieldDescription>
                      ) : null}
                      <dl className="grid grid-cols-3 gap-2 text-xs">
                        <Signal
                          hint={
                            research.signals.affinity === undefined
                              ? t("affinityUnavailableHint")
                              : undefined
                          }
                          label={t("affinity")}
                          value={
                            research.signals.affinity === undefined
                              ? t("affinityUnavailable")
                              : decimal(research.signals.affinity)
                          }
                        />
                        <Signal
                          label={t("news")}
                          value={format.number(research.signals.newsHits)}
                        />
                        <Signal
                          label={t("listings")}
                          value={format.number(research.signals.marketHits)}
                        />
                      </dl>
                    </FieldContent>
                  </Field>
                </FieldLabel>
                {/* Sources sit outside the label so a link click doesn't toggle the pick. */}
                {research.sources.length > 0 ? (
                  <p className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-xs">
                    <span>{t("sources")}:</span>
                    {research.sources.slice(0, 3).map((source) => (
                      <a
                        className="text-accent-text inline-flex min-h-6 max-w-56 items-center gap-1 font-semibold underline"
                        href={source.url}
                        key={source.url}
                        rel="noopener noreferrer"
                        target="_blank"
                      >
                        <span className="truncate">{source.title}</span>
                        <ExternalLink
                          aria-hidden="true"
                          className="size-3 shrink-0"
                        />
                      </a>
                    ))}
                  </p>
                ) : null}
                {research.taste ? (
                  <TasteMapPanel taste={research.taste} />
                ) : null}
                <WhoBuysPanel ideaId={idea.id} />
                <IdeaEvidence research={research} />
                <IdeaCompetition
                  competition={idea.competition}
                  ideaId={idea.id}
                />
                {checked && !designed ? (
                  <DropStylePanel ideaId={idea.id} />
                ) : null}
                <IdeaDossier ideaId={idea.id} />
              </li>
            );
          })}
        </ul>
      </FieldSet>
      <CapsulePanel ideaId={picked[0]} runId={runId} />
      <StepActions busyLabel={busyLabel}>
        <NextButton disabled={Boolean(busyLabel)} onClick={onNext}>
          {t("submit")}
        </NextButton>
      </StepActions>
    </div>
  );
};

// The trademark guardrail's findings on the printed words, with the pages
// that matched. Clear phrases aren't listed.
const TrademarkEvidence = ({
  trademark,
}: {
  trademark: Design["judgment"]["trademark"];
}) => {
  const t = useTranslations("Wizard.evidence");
  const flagged = (trademark?.checks ?? []).filter(
    (check) => check.verdict !== "clear"
  );
  if (flagged.length === 0) {
    return null;
  }
  const label = {
    blocked: t("trademarkBlocked"),
    caution: t("trademarkCaution"),
    unchecked: t("trademarkUnchecked"),
  } as const;
  return (
    <section aria-label={t("trademarkTitle")} className="flex flex-col gap-1">
      <h4 className="text-xs font-semibold">{t("trademarkTitle")}</h4>
      <ul className="flex flex-col gap-1 text-xs">
        {flagged.map((check) => (
          <li className="flex flex-col gap-1" key={check.phrase}>
            <span>
              “{check.phrase}”:{" "}
              {check.verdict === "clear" ? null : label[check.verdict]}
            </span>
            <Citations citations={check.citations} max={3} />
          </li>
        ))}
      </ul>
    </section>
  );
};

const DesignCard = ({
  design,
  reason,
  disabled,
  onReason,
  onApprove,
  onReject,
  onRetry,
}: {
  design: Design;
  reason: string;
  disabled: boolean;
  onReason: (value: string) => void;
  onApprove: () => void;
  onReject: () => void;
  onRetry: () => void;
}) => {
  const t = useTranslations("Wizard.designs");
  const reasonId = useId();
  const approved = design.status === "approved";
  const rejected = design.status === "rejected";
  const { judgment, brief } = design;
  // A design the check sent back is never offered like a ready one: its
  // failed checks are named and approving it reads "Approve anyway".
  const flagged = judgment.verdict !== "ready";
  const failedChecks = judgment.checks.filter((check) => !check.pass);
  return (
    <li className="flex">
      <Card
        className={cn(
          "w-full pt-0",
          approved && "ring-success ring-2",
          rejected && "ring-input"
        )}
      >
        <DesignPreview
          artworkUrl={design.artworkUrl}
          dimmed={rejected}
          mockupStatus={design.mockupStatus}
          mockups={design.mockups}
          title={brief.title}
        />
        <CardHeader>
          <CardTitle className="flex items-start justify-between gap-2">
            <h3 className="font-display text-base font-semibold">
              {brief.title}
            </h3>
            {approved ? <Badge>{t("approved")}</Badge> : null}
            {rejected ? <Badge variant="outline">{t("rejected")}</Badge> : null}
          </CardTitle>
          {brief.printedText.length > 0 ? (
            <CardDescription className="text-xs">
              {t("printed", { text: brief.printedText.join(" · ") })}
            </CardDescription>
          ) : null}
        </CardHeader>
        <CardContent className="flex flex-1 flex-col gap-3">
          <p className="text-muted-foreground text-xs">
            <span className="text-foreground font-semibold">
              {t("check")}:{" "}
              {judgment.verdict === "ready"
                ? t("checkReady")
                : t("checkRevise")}{" "}
              ({t("checkScore", { score: Math.round(judgment.score) })})
            </span>{" "}
            {judgment.coach}
          </p>
          {flagged && design.status === "pending_approval" ? (
            <Alert variant="destructive">
              <CircleAlert aria-hidden="true" />
              <AlertDescription className="text-xs">
                <p>{t("flagged")}</p>
                <ul className="list-disc pl-4">
                  {failedChecks.map((check) => (
                    <li key={check.rule}>{check.note}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          ) : null}
          <TrademarkEvidence trademark={judgment.trademark} />
          {design.status === "pending_approval" ? (
            <Field>
              <div className="flex items-center justify-between gap-2">
                <FieldLabel className="text-xs" htmlFor={reasonId}>
                  {t("reasonLabel")}
                </FieldLabel>
                <DictationMic
                  field={reasonId}
                  label={t("reasonLabel")}
                  maxLength={500}
                  onText={onReason}
                />
              </div>
              <Textarea
                className="min-h-14 text-sm"
                id={reasonId}
                maxLength={500}
                onChange={(event) => onReason(event.target.value)}
                placeholder={t("reasonPlaceholder")}
                value={reason}
              />
            </Field>
          ) : null}
        </CardContent>
        {design.status === "pending_approval" ? (
          <CardFooter className="grid grid-cols-2 gap-2 pb-4">
            <Button
              className="h-9"
              disabled={disabled}
              onClick={onApprove}
              variant="outline"
            >
              <Check aria-hidden="true" data-icon="inline-start" />
              {flagged ? t("approveAnyway") : t("approve")}
            </Button>
            <Button
              className="h-9"
              disabled={disabled}
              onClick={onReject}
              variant="ghost"
            >
              <X aria-hidden="true" data-icon="inline-start" />
              {t("reject")}
            </Button>
          </CardFooter>
        ) : null}
        {rejected ? (
          <CardFooter className="pb-4">
            <Button
              className="h-9 w-full"
              disabled={disabled}
              onClick={onRetry}
              variant="outline"
            >
              <RotateCcw aria-hidden="true" data-icon="inline-start" />
              {t("retry")}
            </Button>
          </CardFooter>
        ) : null}
      </Card>
    </li>
  );
};

export const DesignsStep = ({
  designs,
  drawing,
  reasons,
  busyLabel,
  onReason,
  onApprove,
  onReject,
  onRetry,
  onBack,
  onNext,
}: {
  designs: Design[];
  // Picked ideas whose design is still being drawn, by title.
  drawing: readonly { id: string; title: string }[];
  reasons: Record<string, string>;
  busyLabel?: string | undefined;
  onReason: (id: string, value: string) => void;
  onApprove: (design: Design) => void;
  onReject: (design: Design) => void;
  onRetry: (design: Design) => void;
  onBack: () => void;
  onNext: () => void;
}) => {
  const t = useTranslations("Wizard.designs");
  return (
    <div className="flex flex-col gap-6">
      <StepHeader lead={t("lead")} title={t("title")} />
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {designs.map((design) => (
          <DesignCard
            design={design}
            disabled={Boolean(busyLabel)}
            key={design.id}
            onApprove={() => onApprove(design)}
            onReason={(value) => onReason(design.id, value)}
            onReject={() => onReject(design)}
            onRetry={() => onRetry(design)}
            reason={reasons[design.id] ?? ""}
          />
        ))}
        {drawing.map((idea) => (
          <li
            aria-busy="true"
            className="border-border bg-card flex flex-col gap-3 rounded-xl border p-4"
            key={idea.id}
          >
            <Skeleton className="aspect-square w-full rounded-lg" />
            <output className="text-muted-foreground text-sm">
              {t("drawing", { title: idea.title })}
            </output>
          </li>
        ))}
      </ul>
      <StepActions busyLabel={busyLabel} onBack={onBack}>
        <NextButton disabled={Boolean(busyLabel)} onClick={onNext}>
          {t("submit")}
        </NextButton>
      </StepActions>
    </div>
  );
};

/**
 * A Home pick's designs step before anything is drawn: its tone and colours,
 * open to review or change. The idea, its research report and who buys it
 * read once, in the drop page's own sections above. "Make designs" draws
 * them with all of it.
 */
export const PickReviewStep = ({
  busyLabel,
  ideas,
  onMake,
}: {
  busyLabel?: string | undefined;
  ideas: readonly Idea[];
  onMake: () => void;
}) => {
  const t = useTranslations("Wizard.designs");
  // One idea (a Home pick) needs no name: the page is about it.
  const named = ideas.length > 1;
  return (
    <div className="flex flex-col gap-6">
      <StepHeader lead={t("reviewLead")} title={t("reviewTitle")} />
      <ul className="flex flex-col gap-4">
        {ideas.map((idea) => (
          <li className="flex flex-col gap-2" key={idea.id}>
            {named ? (
              <h3 className="text-sm font-semibold">
                {namedWords(idea)?.title ?? idea.theme}
              </h3>
            ) : null}
            <DropStylePanel ideaId={idea.id} />
          </li>
        ))}
      </ul>
      <StepActions busyLabel={busyLabel}>
        <NextButton disabled={Boolean(busyLabel)} onClick={onMake}>
          {t("make")}
        </NextButton>
      </StepActions>
    </div>
  );
};

/**
 * The confirm before a product goes live: the click in the flow is the
 * merchant's approval, so it names the product, its price and the shop.
 */
/**
 * Why this price, from Fourthwall's cost to make it (the cheapest size) and
 * wovain's pricing rule. Shows nothing until the cost is read.
 */
const PriceWhy = ({ product }: { product: Product }) => {
  const t = useTranslations("Wizard.products");
  const format = useFormatter();
  const money = useMoney();
  const costs = useQuery({
    ...orpc.store.priceCheck.queryOptions({ input: { productId: product.id } }),
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });
  if (!costs.data) {
    return null;
  }
  const check = checkPrice(costs.data.rules, product.price, costs.data.costs);
  const [base] = (check?.sizes ?? []).toSorted((a, b) => a.cost - b.cost);
  if (base === undefined) {
    return null;
  }
  const percent = (value: number) =>
    format.number(value, { maximumFractionDigits: 0, style: "percent" });
  const { rules } = costs.data;
  return (
    <span className="text-muted-foreground flex flex-col gap-0.5 text-xs">
      <span className="figures">
        {t("breakdown", {
          cost: money(base.cost),
          margin: percent(base.grossMargin),
          profit: money(base.profit),
        })}
      </span>
      <span>
        {t("rule", {
          margin: percent(rules.minMarginPct / 100),
          profit: money(rules.minProfit),
        })}
      </span>
    </span>
  );
};

const PublishConfirm = ({
  onCancel,
  onConfirm,
  product,
  title,
}: {
  onCancel: () => void;
  onConfirm: (product: Product) => void;
  product: Product | undefined;
  title: string;
}) => {
  const t = useTranslations("Wizard.products.confirm");
  const money = useMoney();
  const shop = useQuery({
    ...orpc.store.setup.queryOptions(),
    enabled: product !== undefined,
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const shopName = shop.data?.shop.name ?? t("yourShop");
  const price = money(product?.price ?? 0);
  return (
    <AlertDialog
      onOpenChange={(open) => {
        if (!open) {
          onCancel();
        }
      }}
      open={product !== undefined}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("title", { title })}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("body", { price, shop: shopName })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          <dt className="text-muted-foreground">{t("product")}</dt>
          <dd className="font-medium">{title}</dd>
          <dt className="text-muted-foreground">{t("price")}</dt>
          <dd className="figures font-medium">{price}</dd>
          {product ? (
            <dd className="col-span-2">
              <PriceWhy product={product} />
            </dd>
          ) : null}
          <dt className="text-muted-foreground">{t("shop")}</dt>
          <dd className="font-medium">{shopName}</dd>
        </dl>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              if (product) {
                onConfirm(product);
              }
            }}
          >
            {t("action")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

const READINESS_POLL_MS = 10_000;

export const ProductsStep = ({
  products,
  titles,
  busyLabel,
  onPublish,
  onNext,
}: {
  products: Product[];
  titles: Record<string, string>;
  busyLabel?: string | undefined;
  onPublish: (product: Product) => void;
  onNext: () => void;
}) => {
  const t = useTranslations("Wizard.products");
  const money = useMoney();
  const [confirming, setConfirming] = useState<Product>();
  // The shop must take orders before a publish goes through (store
  // management): what blocks it is fixed here, never only in the Store.
  // Errors (store management off) leave publishing open.
  // Polled while a check fails, so it ticks once fixed in Fourthwall.
  const readiness = useQuery({
    ...orpc.store.readiness.queryOptions(),
    refetchInterval: (query) =>
      query.state.data?.ready === false ? READINESS_POLL_MS : false,
    retry: false,
  });
  const blocked = readiness.data?.ready === false;
  return (
    <div className="flex flex-col gap-6">
      <StepHeader lead={t("lead")} title={t("title")} />
      {readiness.data ? <ReadinessGate readiness={readiness.data} /> : null}
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {products.map((product) => {
          const live = product.status === "public";
          const title = titles[product.designId] ?? "";
          const [mockup] = product.mockups;
          return (
            <li className="flex" key={product.id}>
              <Card className="w-full pt-0">
                <div className="bg-muted relative aspect-square">
                  {mockup ? (
                    <Image
                      alt={t("mockupAlt", { title })}
                      className="size-full object-contain"
                      height={IMAGE_SIZE}
                      src={mockup}
                      unoptimized
                      width={IMAGE_SIZE}
                    />
                  ) : null}
                </div>
                <CardHeader>
                  <CardTitle className="flex items-start justify-between gap-2">
                    <h3 className="font-display text-base font-semibold">
                      {title}
                    </h3>
                    <Badge variant={live ? "default" : "outline"}>
                      {t(STATUS_KEY[product.status] ?? "hidden")}
                    </Badge>
                  </CardTitle>
                  <CardDescription>
                    {t("price")}:{" "}
                    <span className="text-foreground figures font-semibold">
                      {money(product.price)}
                    </span>
                    <PriceWhy product={product} />
                  </CardDescription>
                </CardHeader>
                <CardFooter className="mt-auto pb-4">
                  {live && product.productUrl ? (
                    <a
                      className={cn(
                        buttonVariants({ variant: "outline" }),
                        "h-9 w-full"
                      )}
                      href={product.productUrl}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      {t("view")}
                      <ExternalLink aria-hidden="true" data-icon="inline-end" />
                    </a>
                  ) : (
                    <Button
                      className="h-9 w-full"
                      disabled={Boolean(busyLabel) || live || blocked}
                      onClick={() => setConfirming(product)}
                      variant="outline"
                    >
                      <Upload aria-hidden="true" data-icon="inline-start" />
                      {t("publish")}
                    </Button>
                  )}
                </CardFooter>
              </Card>
            </li>
          );
        })}
      </ul>
      <PublishConfirm
        onCancel={() => setConfirming(undefined)}
        onConfirm={(product) => {
          setConfirming(undefined);
          onPublish(product);
        }}
        product={confirming}
        title={confirming ? (titles[confirming.designId] ?? "") : ""}
      />
      <StepActions busyLabel={busyLabel}>
        <NextButton disabled={Boolean(busyLabel)} onClick={onNext}>
          {t("submit")}
        </NextButton>
      </StepActions>
    </div>
  );
};
