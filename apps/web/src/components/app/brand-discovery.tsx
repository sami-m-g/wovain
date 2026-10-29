"use client";

import { useQuery } from "@tanstack/react-query";
import {
  AGE_BANDS,
  FEELINGS,
  GOALS,
  INVOLVEMENT,
} from "@wovain/core/discovery-options";
import type {
  AgeBand,
  Feeling,
  Goal,
  Involvement,
} from "@wovain/core/discovery-options";
import { QLOO_AUDIENCES } from "@wovain/core/qloo-audiences";
import {
  Alert,
  AlertAction,
  AlertDescription,
} from "@wovain/ui/components/alert";
import { Badge } from "@wovain/ui/components/badge";
import { Button } from "@wovain/ui/components/button";
import { Field, FieldLabel } from "@wovain/ui/components/field";
import { Input } from "@wovain/ui/components/input";
import { Skeleton } from "@wovain/ui/components/skeleton";
import { Spinner } from "@wovain/ui/components/spinner";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@wovain/ui/components/toggle-group";
import {
  CloudSun,
  Coffee,
  Flame,
  Laugh,
  Leaf,
  Medal,
  RefreshCw,
  Sparkles,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useState } from "react";

import type {
  CardPalette,
  Discovery,
  StarterCard,
  TasteMatch,
} from "@/lib/flow-client";
import { orpc } from "@/utils/orpc";

export const audienceKey = (id: string) => id.split(":").at(-1) ?? id;

const FEELING_ICONS: Record<Feeling, LucideIcon> = {
  calm: Leaf,
  cosy: Coffee,
  dreamy: CloudSun,
  funny: Laugh,
  proud: Medal,
  rebellious: Flame,
};

/** The palette as small garment swatches with the art colours on them. */
export const PaletteMockup = ({
  palette,
  size = "md",
}: {
  palette: Pick<CardPalette, "garments" | "inks">;
  size?: "md" | "sm";
}) => (
  <div aria-hidden="true" className="flex gap-1.5">
    {palette.garments.map((garment) => (
      <span
        className={`border-border flex items-center justify-center gap-0.5 rounded-md border ${size === "sm" ? "h-7 w-9" : "h-10 w-12"}`}
        key={garment.name}
        style={{ backgroundColor: garment.hex }}
        title={garment.name}
      >
        {palette.inks.map((ink) => (
          <span
            className={`rounded-full ${size === "sm" ? "size-1.5" : "size-2.5"}`}
            key={ink}
            style={{ backgroundColor: ink }}
          />
        ))}
      </span>
    ))}
  </div>
);

/** "25 to 29, mostly women": who Qloo says buys. */
export const useBuyersLine = () => {
  const t = useTranslations("Onboarding.brand");
  return (buyers: StarterCard["buyers"]) => {
    const ages = [buyers.age, buyers.nextAge]
      .filter((age): age is AgeBand => age !== undefined)
      .map((age) => t(`ages.${age}`));
    const parts = [
      ages.length === 0 ? t("buyersPanel.unknownAge") : ages.join(" / "),
      buyers.gender === undefined ? undefined : t(`gender.${buyers.gender}`),
    ].filter((part): part is string => part !== undefined);
    return parts.join(", ");
  };
};

const percent = (value: number) => Math.round(value * 100) / 100;

/** One starter brand: who buys, their taste, colours, products and why. */
const StarterCardItem = ({
  card,
  chosen,
  onUse,
}: {
  card: StarterCard;
  chosen: boolean;
  onUse: () => void;
}) => {
  const t = useTranslations("Onboarding.brand");
  const buyersLine = useBuyersLine();
  const [palette] = card.palettes;
  const titleId = useId();
  return (
    <li
      aria-labelledby={titleId}
      className={`bg-card flex flex-col gap-4 rounded-xl border p-5 transition-colors ${chosen ? "border-primary" : "border-border"}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h3
            className="font-display text-lg font-semibold tracking-[-0.02em]"
            id={titleId}
          >
            {card.name}
          </h3>
          <p className="text-muted-foreground text-sm">{card.niche}</p>
        </div>
        <Button
          aria-pressed={chosen}
          className="h-9"
          onClick={onUse}
          type="button"
          variant={chosen ? "secondary" : "default"}
        >
          {chosen ? t("discover.using") : t("discover.use")}
        </Button>
      </div>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <dt className="text-muted-foreground text-xs font-medium">
            {t("discover.buyers")}
          </dt>
          <dd>{buyersLine(card.buyers)}</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-muted-foreground text-xs font-medium">
            {t("discover.taste")}
          </dt>
          <dd className="flex flex-wrap gap-1">
            {card.references.map((reference) => (
              <Badge key={reference.id} variant="outline">
                {reference.name}
              </Badge>
            ))}
          </dd>
        </div>
        {palette === undefined ? null : (
          <div className="flex flex-col gap-1">
            <dt className="text-muted-foreground text-xs font-medium">
              {t("fields.palette.label")}
            </dt>
            <dd className="flex items-center gap-2">
              <PaletteMockup palette={palette} />
              <span>{palette.label}</span>
            </dd>
          </div>
        )}
        <div className="flex flex-col gap-1">
          <dt className="text-muted-foreground text-xs font-medium">
            {t("discover.products")}
          </dt>
          <dd>
            <ul className="flex flex-col gap-0.5">
              {card.products.map((product) => (
                <li key={`${product.kind}-${product.idea}`}>
                  <span className="font-medium">
                    {t(`kinds.${product.kind}`)}
                  </span>
                  {": "}
                  {product.idea}
                </li>
              ))}
            </ul>
          </dd>
        </div>
      </dl>
      <div className="border-border flex flex-col gap-2 border-t pt-3 text-sm">
        <p>
          <span className="font-medium">{t("discover.why")}: </span>
          {card.why}
        </p>
        <ul
          aria-label={t("discover.evidence")}
          className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs tabular-nums"
        >
          <li>
            {t("discover.match", {
              value: percent(card.evidence.qlooAffinity),
            })}
          </li>
          <li>
            {card.evidence.momentum === undefined ? (
              t("discover.competition.unknown")
            ) : (
              <>
                {t("discover.news", { count: card.evidence.momentum.hits })}
                {card.evidence.momentum.sources.slice(0, 2).map((source) => (
                  <a
                    className="ms-1.5 underline underline-offset-2"
                    href={source.url}
                    key={source.url}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    {new URL(source.url).hostname.replace(/^www\./u, "")}
                  </a>
                ))}
              </>
            )}
          </li>
          <li>
            {card.evidence.saturation === undefined
              ? t("discover.competition.unknown")
              : `${t(`discover.competition.${card.evidence.saturation.level}`)} (${t(
                  "discover.listings",
                  {
                    count: card.evidence.saturation.count,
                    sampled: card.evidence.saturation.sampled,
                  }
                )})`}
          </li>
        </ul>
      </div>
    </li>
  );
};

/** Three placeholder cards while Qloo, Tavily and the writer work. */
export const CardSkeletons = () => {
  const t = useTranslations("Onboarding.brand.discover");
  return (
    <div aria-live="polite" className="flex flex-col gap-3">
      <p className="text-muted-foreground flex items-center gap-2 text-sm">
        <Spinner aria-hidden="true" />
        {t("working")}
      </p>
      {["one", "two", "three"].map((key) => (
        <div
          className="border-border flex flex-col gap-3 rounded-xl border p-5"
          key={key}
        >
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-56" />
          <div className="grid gap-2 sm:grid-cols-2">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        </div>
      ))}
    </div>
  );
};

/** The cards, an empty state, the retry, and the Qloo credit. */
export const StarterCards = ({
  chosen,
  error,
  isPending,
  onMore,
  onRetry,
  onUse,
  result,
}: {
  chosen: string | undefined;
  error: Error | null;
  isPending: boolean;
  onMore?: (() => void) | undefined;
  onRetry: () => void;
  onUse: (card: StarterCard, blank: Discovery["blank"]) => void;
  result: Discovery | undefined;
}) => {
  const t = useTranslations("Onboarding.brand.discover");
  if (isPending) {
    return <CardSkeletons />;
  }
  if (error !== null) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{error.message || t("failed")}</AlertDescription>
        <AlertAction>
          <Button onClick={onRetry} size="sm" type="button" variant="outline">
            <RefreshCw aria-hidden="true" data-icon="inline-start" />
            {t("retry")}
          </Button>
        </AlertAction>
      </Alert>
    );
  }
  if (result === undefined) {
    return null;
  }
  return (
    <div className="flex flex-col gap-3" aria-live="polite">
      {result.cards.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {result.cards.map((card) => (
            <StarterCardItem
              card={card}
              chosen={chosen === card.key}
              key={card.key}
              onUse={() => onUse(card, result.blank)}
            />
          ))}
        </ul>
      )}
      <div className="text-muted-foreground flex flex-wrap items-center justify-between gap-2 text-xs">
        <span>
          {result.blank.assumed
            ? t("blankAssumed")
            : t("blankOn", { name: result.blank.name })}
          {result.tavilyFailed ? ` ${t("partial")}` : null}
        </span>
        <span>{t("credit")}</span>
      </div>
      {onMore === undefined ? null : (
        <Button
          className="self-start"
          onClick={onMore}
          type="button"
          variant="outline"
        >
          <Sparkles aria-hidden="true" data-icon="inline-start" />
          {t("more")}
        </Button>
      )}
    </div>
  );
};

export interface Answers {
  age?: AgeBand | undefined;
  audiences: string[];
  feeling?: Feeling | undefined;
  gender?: "female" | "male" | undefined;
  goal?: Goal | undefined;
  involvement?: Involvement | undefined;
  loves: TasteMatch[];
}

const GENDER_OPTIONS = [
  ["anyone", "anyone"],
  ["female", "women"],
  ["male", "men"],
] as const;

const STEPS = ["feeling", "loves", "who", "goal", "involvement"] as const;
const MAX_LOVES = 5;
const MAX_AUDIENCES = 3;
const SEARCH_DELAY_MS = 300;
const MIN_QUERY = 2;

const chip =
  "aria-pressed:border-primary aria-pressed:bg-accent-soft h-10 gap-2 rounded-lg border px-3";

/** Autocomplete over Qloo for "things you love". */
const LovesStep = ({
  loves,
  setLoves,
}: {
  loves: TasteMatch[];
  setLoves: (next: TasteMatch[]) => void;
}) => {
  const t = useTranslations("Onboarding.brand.questions.loves");
  const id = useId();
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setQuery(text.trim()), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [text]);
  const search = useQuery(
    orpc.onboarding.searchTaste.queryOptions({
      enabled: query.length >= MIN_QUERY,
      input: { query },
      staleTime: 5 * 60_000,
    })
  );
  const picked = new Set(loves.map((love) => love.id));
  const found = (search.data ?? []).filter((match) => !picked.has(match.id));
  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground text-sm">{t("help")}</p>
      {loves.length > 0 ? (
        <ul aria-label={t("picked")} className="flex flex-wrap gap-1.5">
          {loves.map((love) => (
            <li key={love.id}>
              <Badge className="gap-1 pe-1" variant="secondary">
                {love.name}
                <button
                  aria-label={t("remove", { name: love.name })}
                  className="hover:bg-muted rounded-sm p-0.5"
                  onClick={() =>
                    setLoves(loves.filter((one) => one.id !== love.id))
                  }
                  type="button"
                >
                  <X aria-hidden="true" className="size-3" />
                </button>
              </Badge>
            </li>
          ))}
        </ul>
      ) : null}
      {loves.length < MAX_LOVES ? (
        <Field>
          <FieldLabel className="sr-only" htmlFor={`${id}-love`}>
            {t("label")}
          </FieldLabel>
          <Input
            autoComplete="off"
            className="h-10"
            id={`${id}-love`}
            maxLength={80}
            onChange={(event) => setText(event.target.value)}
            placeholder={t("placeholder")}
            value={text}
          />
        </Field>
      ) : null}
      <div aria-live="polite">
        {search.isFetching ? (
          <p className="text-muted-foreground text-sm">{t("searching")}</p>
        ) : null}
        {!search.isFetching &&
        query.length >= MIN_QUERY &&
        search.data !== undefined &&
        found.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("none")}</p>
        ) : null}
        {found.length > 0 && loves.length < MAX_LOVES ? (
          <ul className="flex flex-wrap gap-1.5">
            {found.map((match) => (
              <li key={match.id}>
                <Button
                  className="h-9"
                  onClick={() => {
                    setLoves([...loves, match]);
                    setText("");
                  }}
                  type="button"
                  variant="outline"
                >
                  {match.name}
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
};

const WhoStep = ({
  answers,
  setAnswers,
}: {
  answers: Answers;
  setAnswers: (next: Answers) => void;
}) => {
  const t = useTranslations("Onboarding.brand");
  const audiences = useTranslations("Onboarding.brand.audiences");
  // Qloo's own name for an audience the app has no translation for.
  const audienceName = (id: string, fallback: string) => {
    const key = audienceKey(id) as Parameters<typeof audiences>[0];
    return audiences.has(key) ? audiences(key) : fallback;
  };
  const genderValue = answers.gender ?? "anyone";
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">{t("questions.who.age")}</span>
        <ToggleGroup
          aria-label={t("questions.who.age")}
          className="flex flex-wrap gap-2"
          onValueChange={(value) => {
            const [next] = value;
            setAnswers({
              ...answers,
              age: AGE_BANDS.find((band) => band === next),
            });
          }}
          value={answers.age === undefined ? [] : [answers.age]}
        >
          {AGE_BANDS.map((band) => (
            <ToggleGroupItem className={chip} key={band} value={band}>
              {t(`ages.${band}`)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">{t("questions.who.gender")}</span>
        <ToggleGroup
          aria-label={t("questions.who.gender")}
          className="flex flex-wrap gap-2"
          onValueChange={(value) => {
            const [next] = value;
            setAnswers({
              ...answers,
              gender: next === "female" || next === "male" ? next : undefined,
            });
          }}
          value={[genderValue]}
        >
          {GENDER_OPTIONS.map(([option, label]) => (
            <ToggleGroupItem className={chip} key={option} value={option}>
              {t(`questions.who.${label}`)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">
          {t("questions.who.interests")}
        </span>
        <ToggleGroup
          aria-label={t("questions.who.interests")}
          className="flex flex-wrap gap-2"
          multiple
          onValueChange={(value) =>
            setAnswers({ ...answers, audiences: value.slice(0, MAX_AUDIENCES) })
          }
          value={answers.audiences}
        >
          {QLOO_AUDIENCES.map((audience) => (
            <ToggleGroupItem
              className={chip}
              disabled={
                answers.audiences.length >= MAX_AUDIENCES &&
                !answers.audiences.includes(audience.id)
              }
              key={audience.id}
              value={audience.id}
            >
              {audienceName(audience.id, audience.name)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
    </div>
  );
};

/** One single-choice question as chips. */
const ChoiceStep = <T extends string>({
  icons,
  label,
  onChange,
  options,
  optionLabel,
  value,
}: {
  icons?: Record<T, LucideIcon> | undefined;
  label: string;
  onChange: (next: T | undefined) => void;
  optionLabel: (option: T) => string;
  options: readonly T[];
  value: T | undefined;
}) => (
  <ToggleGroup
    aria-label={label}
    className="flex flex-wrap gap-2"
    onValueChange={(next) => {
      const [first] = next;
      onChange(options.find((option) => option === first));
    }}
    value={value === undefined ? [] : [value]}
  >
    {options.map((option) => {
      const Icon: LucideIcon | undefined = icons?.[option];
      return (
        <ToggleGroupItem className={chip} key={option} value={option}>
          {Icon === undefined ? null : (
            <Icon aria-hidden="true" className="size-4" />
          )}
          {optionLabel(option)}
        </ToggleGroupItem>
      );
    })}
  </ToggleGroup>
);

/** Five short questions about feelings and goals, never design terms. */
export const Questionnaire = ({
  answers,
  busy,
  onFinish,
  setAnswers,
}: {
  answers: Answers;
  busy: boolean;
  onFinish: () => void;
  setAnswers: (next: Answers) => void;
}) => {
  const t = useTranslations("Onboarding.brand.questions");
  const [at, setAt] = useState(0);
  const step = STEPS[at] ?? "feeling";
  const last = at === STEPS.length - 1;
  const ready = answers.audiences.length > 0 || answers.loves.length > 0;
  const titleId = useId();
  return (
    <section
      aria-labelledby={titleId}
      className="border-border flex flex-col gap-4 rounded-xl border p-5"
    >
      <div className="flex flex-col gap-1">
        <p className="text-muted-foreground text-xs tabular-nums">
          {t("progress", { current: at + 1, total: STEPS.length })}
        </p>
        <h3
          className="font-display text-lg font-semibold tracking-[-0.02em]"
          id={titleId}
        >
          {t(`${step}.title`)}
        </h3>
      </div>
      {step === "feeling" ? (
        <ChoiceStep
          icons={FEELING_ICONS}
          label={t("feeling.title")}
          onChange={(feeling) => setAnswers({ ...answers, feeling })}
          optionLabel={(option) => t(`feeling.options.${option}`)}
          options={FEELINGS}
          value={answers.feeling}
        />
      ) : null}
      {step === "loves" ? (
        <LovesStep
          loves={answers.loves}
          setLoves={(loves) => setAnswers({ ...answers, loves })}
        />
      ) : null}
      {step === "who" ? (
        <WhoStep answers={answers} setAnswers={setAnswers} />
      ) : null}
      {step === "goal" ? (
        <ChoiceStep
          label={t("goal.title")}
          onChange={(goal) => setAnswers({ ...answers, goal })}
          optionLabel={(option) => t(`goal.options.${option}`)}
          options={GOALS}
          value={answers.goal}
        />
      ) : null}
      {step === "involvement" ? (
        <ChoiceStep
          label={t("involvement.title")}
          onChange={(involvement) => setAnswers({ ...answers, involvement })}
          optionLabel={(option) => t(`involvement.options.${option}`)}
          options={INVOLVEMENT}
          value={answers.involvement}
        />
      ) : null}
      {last && !ready ? (
        <output className="text-muted-foreground text-sm">
          {t("needOne")}
        </output>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          disabled={at === 0}
          onClick={() => setAt(at - 1)}
          type="button"
          variant="ghost"
        >
          {t("back")}
        </Button>
        {last ? (
          <Button disabled={!ready || busy} onClick={onFinish} type="button">
            {busy ? (
              <Spinner aria-hidden="true" data-icon="inline-start" />
            ) : null}
            {t("finish")}
          </Button>
        ) : (
          <Button onClick={() => setAt(at + 1)} type="button" variant="outline">
            {t("next")}
          </Button>
        )}
      </div>
    </section>
  );
};
