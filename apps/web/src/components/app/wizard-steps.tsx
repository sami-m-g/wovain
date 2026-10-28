"use client";

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
import { Textarea } from "@wovain/ui/components/textarea";
import { cn } from "@wovain/ui/lib/utils";
import { Check, ExternalLink, RotateCcw, Upload, X } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import Image from "next/image";
import { useId } from "react";

import { DesignPreview } from "@/components/app/design-preview";
import {
  NextButton,
  StepActions,
  StepHeader,
} from "@/components/app/wizard-parts";
import { Link } from "@/i18n/navigation";
import type { Campaign, Design, Idea, Product } from "@/lib/flow-client";

const CENTS = 100;
const IMAGE_SIZE = 640;
export const MAX_BRIEF = 200;
const MIN_BUDGET = 1;
const MAX_BUDGET = 500;

const useMoney = () => {
  const format = useFormatter();
  return (value: number) =>
    format.number(value, { currency: "USD", style: "currency" });
};

const BudgetField = ({
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
          <InputGroupAddon align="block-end" className="justify-end">
            <InputGroupText aria-hidden="true" className="figures text-xs">
              {format.number(brief.length)}/{format.number(MAX_BRIEF)}
            </InputGroupText>
          </InputGroupAddon>
        </InputGroup>
        <FieldDescription id={`${id}-hint`}>{t("hint")}</FieldDescription>
        {error ? <FieldError>{error}</FieldError> : null}
      </Field>
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

export const IdeasStep = ({
  ideas,
  picked,
  designedIdeaIds,
  busyLabel,
  onToggle,
  onNext,
}: {
  ideas: Idea[];
  picked: string[];
  designedIdeaIds: string[];
  busyLabel?: string | undefined;
  onToggle: (id: string, checked: boolean) => void;
  onNext: () => void;
}) => {
  const t = useTranslations("Wizard.trends");
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
      <FieldSet>
        <FieldLegend className="sr-only">{t("title")}</FieldLegend>
        <ul className="grid gap-3 md:grid-cols-2">
          {ideas.map((idea) => {
            const designed = designedIdeaIds.includes(idea.id);
            const checked = designed || picked.includes(idea.id);
            const checkboxId = `${id}-${idea.id}`;
            const { research } = idea;
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
                        {idea.theme}
                        {designed ? (
                          <Badge variant="secondary">{t("hasDesign")}</Badge>
                        ) : null}
                      </FieldTitle>
                      <span className="text-muted-foreground figures text-xs font-medium">
                        {t("score", { score: decimal(idea.score) })}
                      </span>
                      {research.moment || research.answer ? (
                        <FieldDescription className="text-foreground line-clamp-4">
                          {research.moment ?? research.answer}
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
              </li>
            );
          })}
        </ul>
      </FieldSet>
      <StepActions busyLabel={busyLabel}>
        <NextButton disabled={Boolean(busyLabel)} onClick={onNext}>
          {t("submit")}
        </NextButton>
      </StepActions>
    </div>
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
          {design.status === "pending_approval" ? (
            <Field>
              <FieldLabel className="text-xs" htmlFor={reasonId}>
                {t("reasonLabel")}
              </FieldLabel>
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
              {t("approve")}
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
      </ul>
      <StepActions busyLabel={busyLabel} onBack={onBack}>
        <NextButton disabled={Boolean(busyLabel)} onClick={onNext}>
          {t("submit")}
        </NextButton>
      </StepActions>
    </div>
  );
};

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
  return (
    <div className="flex flex-col gap-6">
      <StepHeader lead={t("lead")} title={t("title")} />
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
                      {live ? t("public") : t("hidden")}
                    </Badge>
                  </CardTitle>
                  <CardDescription>
                    {t("price")}:{" "}
                    <span className="text-foreground figures font-semibold">
                      {money(product.price)}
                    </span>
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
                      disabled={Boolean(busyLabel) || live}
                      onClick={() => onPublish(product)}
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
      <StepActions busyLabel={busyLabel}>
        <NextButton disabled={Boolean(busyLabel)} onClick={onNext}>
          {t("submit")}
        </NextButton>
      </StepActions>
    </div>
  );
};

export const CampaignStep = ({
  budget,
  budgetInvalid,
  busyLabel,
  onBudget,
  onBack,
  onNext,
}: {
  budget: string;
  budgetInvalid: boolean;
  busyLabel?: string | undefined;
  onBudget: (value: string) => void;
  onBack: () => void;
  onNext: () => void;
}) => {
  const t = useTranslations("Wizard.campaign");
  return (
    <form
      className="flex flex-col gap-6"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        onNext();
      }}
    >
      <StepHeader lead={t("lead")} title={t("title")} />
      <BudgetField
        budget={budget}
        invalid={budgetInvalid}
        onBudget={onBudget}
      />
      <StepActions busyLabel={busyLabel} onBack={onBack}>
        <NextButton disabled={Boolean(busyLabel)} type="submit">
          {t("submit")}
        </NextButton>
      </StepActions>
    </form>
  );
};

const adsManagerUrl = (campaign: Campaign) =>
  `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${campaign.adAccountId}&selected_campaign_ids=${campaign.metaCampaignId}`;

export const DoneStep = ({
  campaigns,
  onRestart,
}: {
  campaigns: Campaign[];
  onRestart: () => void;
}) => {
  const t = useTranslations("Wizard.done");
  const money = useMoney();
  const [first] = campaigns;
  return (
    <div className="flex flex-col items-start gap-6">
      <StepHeader
        lead={t("lead", {
          budget: money((first?.dailyBudgetCents ?? 0) / CENTS),
          count: campaigns.length,
        })}
        title={t("title")}
      />
      {campaigns.map((campaign) => (
        <section
          aria-label={t("variants")}
          className="flex w-full flex-col gap-3"
          key={campaign.id}
        >
          <h3 className="text-muted-foreground text-xs font-medium">
            {t("variants")}
          </h3>
          <ul className="grid gap-3 md:grid-cols-3">
            {campaign.copy.map((variant) => (
              <li className="flex" key={variant.headline}>
                <Card className="w-full" size="sm">
                  <CardHeader>
                    <Badge className="w-fit" variant="secondary">
                      {variant.angle}
                    </Badge>
                    <CardTitle className="mt-1 font-medium">
                      {variant.headline}
                    </CardTitle>
                    <CardDescription>{variant.message}</CardDescription>
                  </CardHeader>
                </Card>
              </li>
            ))}
          </ul>
          <a
            className={cn(buttonVariants(), "h-9 w-fit px-4")}
            href={adsManagerUrl(campaign)}
            rel="noopener noreferrer"
            target="_blank"
          >
            {t("open")}
            <ExternalLink aria-hidden="true" data-icon="inline-end" />
          </a>
        </section>
      ))}
      <div className="flex flex-wrap gap-3">
        <Button className="h-9 px-4" onClick={onRestart} variant="outline">
          {t("another")}
        </Button>
        <Link
          className={cn(buttonVariants({ variant: "ghost" }), "h-9 px-4")}
          href="/dashboard/runs"
        >
          {t("history")}
        </Link>
      </div>
    </div>
  );
};
