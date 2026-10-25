"use client";

import { Badge } from "@wovain/ui/components/badge";
import { Button, buttonVariants } from "@wovain/ui/components/button";
import { Checkbox } from "@wovain/ui/components/checkbox";
import { Input } from "@wovain/ui/components/input";
import { Label } from "@wovain/ui/components/label";
import { Textarea } from "@wovain/ui/components/textarea";
import { cn } from "@wovain/ui/lib/utils";
import { Check, ExternalLink, RotateCcw, Upload, X } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import Image from "next/image";
import { useId } from "react";

import {
  NextButton,
  StepActions,
  StepHeader,
} from "@/components/app/wizard-parts";
import { Link } from "@/i18n/navigation";
import type { Campaign, Design, Idea, Product } from "@/lib/flow-client";

const CENTS = 100;
const IMAGE_SIZE = 640;

const useMoney = () => {
  const format = useFormatter();
  return (value: number) =>
    format.number(value, { currency: "USD", style: "currency" });
};

const describedBy = (...ids: (string | false | undefined)[]) =>
  ids.filter(Boolean).join(" ") || undefined;

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
    <div className="flex max-w-xs flex-col gap-2">
      <Label className="text-sm font-semibold" htmlFor={id}>
        {t("budgetLabel")}
      </Label>
      <Input
        aria-describedby={describedBy(`${id}-hint`, invalid && `${id}-error`)}
        aria-invalid={invalid ? true : undefined}
        className="h-11 text-base tabular-nums md:text-sm"
        id={id}
        inputMode="decimal"
        max={500}
        min={1}
        onChange={(event) => onBudget(event.target.value)}
        step="1"
        type="number"
        value={budget}
      />
      <p className="text-muted-foreground text-xs" id={`${id}-hint`}>
        {t("budgetHint")}
      </p>
      {invalid ? (
        <p className="text-destructive text-sm" id={`${id}-error`}>
          {t("budgetError")}
        </p>
      ) : null}
    </div>
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
  const id = useId();
  return (
    <form
      className="flex flex-col gap-5"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <StepHeader focusOnMount={false} title={t("title")} />
      <div className="flex flex-col gap-2">
        <Label className="text-sm font-semibold" htmlFor={id}>
          {t("label")}
        </Label>
        <Textarea
          aria-describedby={describedBy(`${id}-hint`, error && `${id}-error`)}
          aria-invalid={error ? true : undefined}
          className="min-h-28 text-base md:text-sm"
          id={id}
          maxLength={200}
          onChange={(event) => onChange(event.target.value)}
          placeholder={t("placeholder")}
          required
          value={brief}
        />
        <p className="text-muted-foreground text-xs" id={`${id}-hint`}>
          {t("hint")}
        </p>
        {error ? (
          <p className="text-destructive text-sm" id={`${id}-error`}>
            {error}
          </p>
        ) : null}
      </div>
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
    <div className="flex flex-col gap-5">
      <StepHeader lead={t("lead")} title={t("title")} />
      <ul className="grid gap-3 md:grid-cols-2">
        {ideas.map((idea) => {
          const designed = designedIdeaIds.includes(idea.id);
          const checked = designed || picked.includes(idea.id);
          const checkboxId = `${id}-${idea.id}`;
          const { research } = idea;
          return (
            <li
              className={cn(
                "flex flex-col gap-3 border p-4",
                checked ? "border-ink-yellow bg-ink-yellow/10" : "border-border"
              )}
              key={idea.id}
            >
              <div className="flex items-start gap-3">
                <Checkbox
                  checked={checked}
                  className="mt-0.5 size-5"
                  disabled={designed}
                  id={checkboxId}
                  onCheckedChange={(next) => onToggle(idea.id, next)}
                />
                <div className="flex flex-1 flex-col gap-1">
                  <Label className="text-base font-bold" htmlFor={checkboxId}>
                    {idea.theme}
                  </Label>
                  <span className="font-condensed text-muted-foreground flex flex-wrap gap-2 text-xs font-bold tracking-widest uppercase tabular-nums">
                    {t("score", { score: decimal(idea.score) })}
                    {designed ? (
                      <Badge variant="secondary">{t("hasDesign")}</Badge>
                    ) : null}
                  </span>
                </div>
              </div>
              {research.moment || research.answer ? (
                <p className="line-clamp-4 text-sm">
                  {research.moment ?? research.answer}
                </p>
              ) : null}
              <dl className="grid grid-cols-3 gap-2 text-xs">
                <div className="bg-muted p-2">
                  <dt className="text-muted-foreground">{t("affinity")}</dt>
                  <dd className="font-semibold tabular-nums">
                    {research.signals.affinity === undefined
                      ? "–"
                      : decimal(research.signals.affinity)}
                  </dd>
                </div>
                <div className="bg-muted p-2">
                  <dt className="text-muted-foreground">{t("news")}</dt>
                  <dd className="font-semibold tabular-nums">
                    {format.number(research.signals.newsHits)}
                  </dd>
                </div>
                <div className="bg-muted p-2">
                  <dt className="text-muted-foreground">{t("listings")}</dt>
                  <dd className="font-semibold tabular-nums">
                    {format.number(research.signals.marketHits)}
                  </dd>
                </div>
              </dl>
              {research.sources.length > 0 ? (
                <p className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  <span>{t("sources")}:</span>
                  {research.sources.slice(0, 3).map((source) => (
                    <a
                      className="text-primary inline-flex min-h-6 max-w-56 items-center gap-1 font-semibold underline"
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
    <li
      className={cn(
        "flex flex-col border",
        approved && "border-ink-green",
        rejected && "border-input border-dashed",
        design.status === "pending_approval" && "border-border"
      )}
    >
      <div className="bg-muted grid aspect-square place-items-center p-4">
        <Image
          alt={t("artAlt", { title: brief.title })}
          className={cn("h-auto w-full", rejected && "opacity-60")}
          height={IMAGE_SIZE}
          src={design.artworkUrl}
          unoptimized
          width={IMAGE_SIZE}
        />
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-bold">{brief.title}</h3>
          {approved ? <Badge>{t("approved")}</Badge> : null}
          {rejected ? <Badge variant="outline">{t("rejected")}</Badge> : null}
        </div>
        {brief.printedText.length > 0 ? (
          <p className="text-muted-foreground text-xs">
            {t("printed", { text: brief.printedText.join(" · ") })}
          </p>
        ) : null}
        <p className="text-muted-foreground text-xs">
          <span className="text-foreground font-semibold">
            {t("check")}:{" "}
            {judgment.verdict === "ready" ? t("checkReady") : t("checkRevise")}{" "}
            ({t("checkScore", { score: Math.round(judgment.score) })})
          </span>{" "}
          {judgment.coach}
        </p>
        {design.status === "pending_approval" ? (
          <>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-semibold" htmlFor={reasonId}>
                {t("reasonLabel")}
              </Label>
              <Textarea
                className="min-h-14 text-sm"
                id={reasonId}
                maxLength={500}
                onChange={(event) => onReason(event.target.value)}
                placeholder={t("reasonPlaceholder")}
                value={reason}
              />
            </div>
            <div className="mt-auto grid grid-cols-2 gap-2">
              <Button
                className="h-10 text-sm font-semibold"
                disabled={disabled}
                onClick={onApprove}
              >
                <Check aria-hidden="true" data-icon="inline-start" />
                {t("approve")}
              </Button>
              <Button
                className="h-10 text-sm font-semibold"
                disabled={disabled}
                onClick={onReject}
                variant="outline"
              >
                <X aria-hidden="true" data-icon="inline-start" />
                {t("reject")}
              </Button>
            </div>
          </>
        ) : null}
        {rejected ? (
          <Button
            className="mt-auto h-10 text-sm font-semibold"
            disabled={disabled}
            onClick={onRetry}
            variant="outline"
          >
            <RotateCcw aria-hidden="true" data-icon="inline-start" />
            {t("retry")}
          </Button>
        ) : null}
      </div>
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
    <div className="flex flex-col gap-5">
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
    <div className="flex flex-col gap-5">
      <StepHeader lead={t("lead")} title={t("title")} />
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {products.map((product) => {
          const live = product.status === "public";
          const title = titles[product.designId] ?? "";
          const [mockup] = product.mockups;
          return (
            <li className="border-border flex flex-col border" key={product.id}>
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
              <div className="flex flex-1 flex-col gap-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-bold">{title}</h3>
                  <Badge variant={live ? "default" : "outline"}>
                    {live ? t("public") : t("hidden")}
                  </Badge>
                </div>
                <p className="text-sm">
                  <span className="text-muted-foreground">{t("price")}: </span>
                  <span className="font-semibold tabular-nums">
                    {money(product.price)}
                  </span>
                </p>
                <div className="mt-auto">
                  {live && product.productUrl ? (
                    <a
                      className={cn(
                        buttonVariants({ variant: "outline" }),
                        "h-10 w-full text-sm font-semibold"
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
                      className="h-10 w-full text-sm font-semibold"
                      disabled={Boolean(busyLabel) || live}
                      onClick={() => onPublish(product)}
                    >
                      <Upload aria-hidden="true" data-icon="inline-start" />
                      {t("publish")}
                    </Button>
                  )}
                </div>
              </div>
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
      className="flex flex-col gap-5"
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
  failure,
  onRestart,
}: {
  campaigns: Campaign[];
  failure?: string | undefined;
  onRestart: () => void;
}) => {
  const t = useTranslations("Wizard.done");
  const money = useMoney();
  const size = "h-11 px-5 text-sm font-semibold";
  const [first] = campaigns;
  return (
    <div className="flex flex-col items-start gap-6">
      {failure ? (
        <StepHeader title={t("autopilotFailed", { error: failure })} />
      ) : (
        <StepHeader
          lead={t("lead", {
            budget: money((first?.dailyBudgetCents ?? 0) / CENTS),
            count: campaigns.length,
          })}
          title={t("title")}
        />
      )}
      {campaigns.map((campaign) => (
        <section
          aria-label={t("variants")}
          className="w-full"
          key={campaign.id}
        >
          <h3 className="font-condensed text-muted-foreground text-xs font-bold tracking-widest uppercase">
            {t("variants")}
          </h3>
          <ul className="mt-3 grid gap-3 md:grid-cols-3">
            {campaign.copy.map((variant) => (
              <li
                className="border-border flex flex-col gap-2 border p-4"
                key={variant.headline}
              >
                <Badge className="w-fit" variant="secondary">
                  {variant.angle}
                </Badge>
                <p className="font-bold">{variant.headline}</p>
                <p className="text-muted-foreground text-sm">
                  {variant.message}
                </p>
              </li>
            ))}
          </ul>
          <a
            className={cn(buttonVariants(), size, "mt-4")}
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
        <Button className={size} onClick={onRestart} variant="outline">
          {t("another")}
        </Button>
        <Link
          className={cn(buttonVariants({ variant: "ghost" }), size)}
          href="/dashboard/runs"
        >
          {t("history")}
        </Link>
      </div>
    </div>
  );
};
