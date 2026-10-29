"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@wovain/ui/components/badge";
import { Button } from "@wovain/ui/components/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSet,
  FieldLegend,
} from "@wovain/ui/components/field";
import { Input } from "@wovain/ui/components/input";
import { Skeleton } from "@wovain/ui/components/skeleton";
import { Spinner } from "@wovain/ui/components/spinner";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@wovain/ui/components/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@wovain/ui/components/tooltip";
import {
  Check,
  CircleHelp,
  Info,
  ListChecks,
  PencilLine,
  Plus,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import type { FormEvent, ReactNode } from "react";
import { useId, useState } from "react";
import { toast } from "sonner";

import type { Answers } from "@/components/app/brand-discovery";
import {
  PaletteMockup,
  Questionnaire,
  StarterCards,
  useBuyersLine,
} from "@/components/app/brand-discovery";
import {
  NextButton,
  StepActions,
  StepHeader,
} from "@/components/app/wizard-parts";
import type {
  CardPalette,
  OnboardingReady,
  ResolvedReference,
  StarterCard,
} from "@/lib/flow-client";
import { client, orpc } from "@/utils/orpc";

const MIN_REFERENCES = 3;
const MAX_REFERENCES = 5;
const MAX_PALETTE = 6;
const HEX = /^#[\da-f]{6}$/iu;
const LIST_SPLIT = /\s*,\s*/u;
const PLACEHOLDERS = ["first", "second", "third"] as const;

const listOf = (text: string) =>
  text
    .split(LIST_SPLIT)
    .map((each) => each.trim())
    .filter((each) => each !== "");

const filledOf = (references: readonly string[]) =>
  references.map((each) => each.trim()).filter((each) => each !== "");

const keyOf = (reference: string) => reference.trim().toLowerCase();

const startingReferences = (saved: readonly string[]) => [
  ...saved,
  ...Array.from(
    { length: Math.max(0, MIN_REFERENCES - saved.length) },
    () => ""
  ),
];

type BrandField = "niche" | "palette" | "references" | "voice";

/** A field's label, a one-line description and an info tooltip with an example. */
const FieldHeading = ({
  field,
  htmlFor,
  id,
  legend = false,
}: {
  field: BrandField;
  htmlFor?: string | undefined;
  id: string;
  legend?: boolean | undefined;
}) => {
  const t = useTranslations("Onboarding.brand.fields");
  const label = t(`${field}.label`);
  const Label = legend ? (
    <FieldLegend className="mb-0">{label}</FieldLegend>
  ) : (
    <FieldLabel htmlFor={htmlFor}>{label}</FieldLabel>
  );
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        {Label}
        <Tooltip>
          <TooltipTrigger
            aria-describedby={`${id}-tip`}
            aria-label={t("info", { field: label })}
            className="text-muted-foreground hover:text-foreground focus-visible:ring-ring rounded-full p-0.5 outline-none focus-visible:ring-2"
            type="button"
          >
            <Info aria-hidden="true" className="size-4" />
          </TooltipTrigger>
          <TooltipContent className="max-w-72" id={`${id}-tip`}>
            {t(`${field}.tip`)}
          </TooltipContent>
        </Tooltip>
      </div>
      <FieldDescription id={`${id}-help`}>
        {t(`${field}.help`)}
      </FieldDescription>
    </div>
  );
};

/** Two or three alternatives for one field, from the chosen starter brand. */
const SuggestionChips = ({
  label,
  onPick,
  options,
}: {
  label: string;
  onPick: (value: string) => void;
  options: readonly string[];
}) => {
  const t = useTranslations("Onboarding.brand.fields");
  if (options.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-muted-foreground text-xs">{t("suggestions")}</span>
      <ul
        aria-label={`${t("suggestions")}: ${label}`}
        className="flex flex-wrap gap-1.5"
      >
        {options.map((option) => (
          <li key={option}>
            <Button
              className="h-8"
              onClick={() => onPick(option)}
              size="sm"
              type="button"
              variant="outline"
            >
              {option}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
};

type RefState =
  | { kind: "checking" }
  | { kind: "error" }
  | { kind: "done"; result: ResolvedReference };

/** How one reference landed, in plain words. */
const ReferenceStatus = ({ state }: { state: RefState | undefined }) => {
  const t = useTranslations("Onboarding.brand.fields.references");
  if (state === undefined) {
    return null;
  }
  if (state.kind === "checking") {
    return (
      <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
        <Spinner aria-hidden="true" className="size-3" />
        {t("checking")}
      </span>
    );
  }
  if (state.kind === "error" || state.result.failed) {
    return <span className="text-muted-foreground text-xs">{t("failed")}</span>;
  }
  if (state.result.status === "unresolved") {
    return (
      <span className="text-muted-foreground text-xs">{t("notFound")}</span>
    );
  }
  return (
    <span className="text-success flex items-center gap-1 text-xs">
      <Check aria-hidden="true" className="size-3" />
      {state.result.status === "proxy" ? t("proxy") : t("placed")}
    </span>
  );
};

/** The 3 to 5 references; each one is checked when the field loses focus. */
const ReferencesField = ({
  alternatives,
  onSuggestRest,
  references,
  setReferences,
  states,
  check,
  suggesting,
}: {
  alternatives: readonly string[];
  check: (reference: string) => Promise<void>;
  onSuggestRest?: (() => void) | undefined;
  references: string[];
  setReferences: (next: string[]) => void;
  states: Map<string, RefState>;
  suggesting: boolean;
}) => {
  const t = useTranslations("Onboarding.brand");
  const id = useId();
  const filled = filledOf(references);
  const free = alternatives.filter(
    (one) => !filled.some((each) => keyOf(each) === keyOf(one))
  );
  return (
    <FieldSet aria-describedby={`${id}-help`}>
      <FieldHeading field="references" id={id} legend />
      <FieldGroup className="gap-3">
        {references.map((value, index) => (
          // The inputs never reorder, so their position is their identity.
          // oxlint-disable-next-line react/no-array-index-key
          <Field key={index}>
            <FieldLabel className="sr-only" htmlFor={`${id}-ref-${index}`}>
              {t("fields.references.item", { number: index + 1 })}
            </FieldLabel>
            <Input
              aria-describedby={`${id}-ref-${index}-status`}
              autoComplete="off"
              className="h-10"
              id={`${id}-ref-${index}`}
              maxLength={120}
              onBlur={async () => {
                await check(value);
              }}
              onChange={(event) => {
                const next = [...references];
                next[index] = event.target.value;
                setReferences(next);
              }}
              placeholder={t(
                `placeholder.${PLACEHOLDERS[index % PLACEHOLDERS.length] ?? "first"}`
              )}
              value={value}
            />
            <div aria-live="polite" id={`${id}-ref-${index}-status`}>
              <ReferenceStatus
                state={
                  value.trim() === "" ? undefined : states.get(keyOf(value))
                }
              />
            </div>
          </Field>
        ))}
      </FieldGroup>
      <div className="flex flex-wrap gap-2">
        {references.length < MAX_REFERENCES ? (
          <Button
            className="h-10 sm:h-9"
            onClick={() => setReferences([...references, ""])}
            type="button"
            variant="ghost"
          >
            <Plus aria-hidden="true" data-icon="inline-start" />
            {t("fields.references.add")}
          </Button>
        ) : null}
        {onSuggestRest === undefined ? null : (
          <Button
            className="h-10 sm:h-9"
            disabled={filled.length === 0 || suggesting}
            onClick={onSuggestRest}
            type="button"
            variant="outline"
          >
            {suggesting ? (
              <Spinner aria-hidden="true" data-icon="inline-start" />
            ) : (
              <Sparkles aria-hidden="true" data-icon="inline-start" />
            )}
            {suggesting ? t("fields.suggesting") : t("fields.suggestRest")}
          </Button>
        )}
      </div>
      {filled.length < MAX_REFERENCES ? (
        <SuggestionChips
          label={t("fields.references.label")}
          onPick={(name) => {
            const empty = references.findIndex((each) => each.trim() === "");
            const next = [...references];
            if (empty === -1) {
              next.push(name);
            } else {
              next[empty] = name;
            }
            setReferences(next.slice(0, MAX_REFERENCES));
          }}
          options={free}
        />
      ) : null}
    </FieldSet>
  );
};

/** Who buys, what else they love and the themes it suggests, from Qloo. */
const BuyersPanelView = ({ references }: { references: string[] }) => {
  const t = useTranslations("Onboarding.brand.buyersPanel");
  const buyersLine = useBuyersLine();
  const id = useId();
  const panel = useQuery(
    orpc.onboarding.buyers.queryOptions({
      enabled: references.length > 0,
      input: { references },
      retry: false,
      staleTime: 10 * 60_000,
    })
  );
  let body: ReactNode;
  if (references.length === 0) {
    body = <p className="text-muted-foreground text-sm">{t("empty")}</p>;
  } else if (panel.isPending) {
    body = (
      <div className="flex flex-col gap-2">
        <span className="sr-only">{t("loading")}</span>
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    );
  } else if (panel.isError) {
    body = (
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">{t("failed")}</span>
        <Button
          onClick={async () => {
            await panel.refetch();
          }}
          size="sm"
          type="button"
          variant="outline"
        >
          <RefreshCw aria-hidden="true" data-icon="inline-start" />
          {t("retry")}
        </Button>
      </div>
    );
  } else if (panel.data === null) {
    body = <p className="text-muted-foreground text-sm">{t("empty")}</p>;
  } else {
    const who = buyersLine(panel.data.buyers);
    body = (
      <dl className="grid gap-4 text-sm sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <dt className="font-medium">{t("who")}</dt>
          <dd>{who}</dd>
          <dd className="text-muted-foreground text-xs">{t("whoMeaning")}</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="font-medium">{t("love")}</dt>
          <dd className="flex flex-wrap gap-1">
            {panel.data.affinities.map((one) => (
              <Badge key={one.id} variant="outline">
                {one.name}
              </Badge>
            ))}
          </dd>
          <dd className="text-muted-foreground text-xs">{t("loveMeaning")}</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="font-medium">{t("themes")}</dt>
          <dd>{panel.data.themes.join(", ")}</dd>
          <dd className="text-muted-foreground text-xs">
            {t("themesMeaning")}
          </dd>
        </div>
      </dl>
    );
  }
  return (
    <section
      aria-busy={panel.isFetching}
      aria-labelledby={id}
      className="bg-muted/40 flex flex-col gap-3 rounded-xl p-4"
    >
      <h3 className="text-sm font-semibold" id={id}>
        {t("title")}
      </h3>
      <div aria-live="polite">{body}</div>
    </section>
  );
};

/** Pick a line that sounds like you, or write your own. */
const VoiceField = ({
  lines,
  setVoice,
  voice,
}: {
  lines: readonly string[];
  setVoice: (next: string) => void;
  voice: string;
}) => {
  const t = useTranslations("Onboarding.brand.fields.voice");
  const id = useId();
  const custom = voice !== "" && !lines.includes(voice);
  return (
    <FieldSet aria-describedby={`${id}-help`}>
      <FieldHeading field="voice" id={id} legend />
      {lines.length > 0 ? (
        <ToggleGroup
          aria-label={t("label")}
          className="flex flex-col items-stretch gap-2"
          onValueChange={(value) => {
            const [next] = value;
            setVoice(next ?? "");
          }}
          value={lines.includes(voice) ? [voice] : []}
        >
          {lines.map((line) => (
            <ToggleGroupItem
              className="aria-pressed:border-primary aria-pressed:bg-accent-soft h-auto min-h-10 justify-start rounded-lg border px-3 py-2 text-start whitespace-normal"
              key={line}
              value={line}
            >
              “{line}”
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      ) : null}
      <details className="group" open={custom || lines.length === 0}>
        <summary className="text-muted-foreground hover:text-foreground flex cursor-pointer items-center gap-1.5 text-sm">
          <PencilLine aria-hidden="true" className="size-4" />
          {t("custom")}
        </summary>
        <Field className="mt-2">
          <FieldLabel className="sr-only" htmlFor={`${id}-custom`}>
            {t("customLabel")}
          </FieldLabel>
          <Input
            className="h-10"
            id={`${id}-custom`}
            maxLength={200}
            onChange={(event) => setVoice(event.target.value)}
            placeholder={t("customPlaceholder")}
            value={custom ? voice : ""}
          />
        </Field>
      </details>
    </FieldSet>
  );
};

/** Pick a colour set shown on the shirt colours; hex entry sits behind Advanced. */
const PaletteField = ({
  hex,
  options,
  palette,
  setHex,
  setPalette,
}: {
  hex: string;
  options: readonly CardPalette[];
  palette: CardPalette | undefined;
  setHex: (next: string) => void;
  setPalette: (next: CardPalette | undefined) => void;
}) => {
  const t = useTranslations("Onboarding.brand.fields.palette");
  const id = useId();
  const colors = listOf(hex);
  const badColor = colors.find((color) => !HEX.test(color));
  const invalid = badColor === undefined ? undefined : true;
  const chosenKey = palette?.inks.join(",");
  return (
    <FieldSet aria-describedby={`${id}-help`}>
      <FieldHeading field="palette" id={id} legend />
      {options.length > 0 ? (
        <ToggleGroup
          aria-label={t("label")}
          className="flex flex-wrap gap-2"
          onValueChange={(value) => {
            const [next] = value;
            setPalette(options.find((one) => one.inks.join(",") === next));
          }}
          value={chosenKey === undefined ? [] : [chosenKey]}
        >
          {options.map((option) => (
            <ToggleGroupItem
              className="aria-pressed:border-primary aria-pressed:bg-accent-soft h-auto flex-col items-start gap-1.5 rounded-lg border p-2.5"
              key={option.inks.join(",")}
              value={option.inks.join(",")}
            >
              <PaletteMockup palette={option} />
              <span className="text-xs font-medium">{option.label}</span>
              <span className="text-muted-foreground text-xs">
                {t("on", {
                  garments: option.garments
                    .map((garment) => garment.name)
                    .join(", "),
                })}
              </span>
              {option.adjusted.length > 0 ? (
                <span className="text-muted-foreground text-[0.7rem]">
                  {t("adjusted")}
                </span>
              ) : null}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      ) : null}
      {palette === undefined && colors.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("none")}</p>
      ) : null}
      {palette === undefined ? null : (
        <Button
          className="self-start"
          onClick={() => setPalette(undefined)}
          size="sm"
          type="button"
          variant="ghost"
        >
          {t("clear")}
        </Button>
      )}
      <details open={palette === undefined && colors.length > 0}>
        <summary className="text-muted-foreground hover:text-foreground cursor-pointer text-sm">
          {t("advanced")}
        </summary>
        <Field className="mt-2" data-invalid={invalid}>
          <FieldLabel htmlFor={`${id}-hex`}>{t("hexLabel")}</FieldLabel>
          <div className="flex items-center gap-2">
            <Input
              aria-describedby={`${id}-hex-help`}
              aria-invalid={invalid}
              className="h-10 font-mono"
              id={`${id}-hex`}
              onChange={(event) => {
                setHex(event.target.value);
                setPalette(undefined);
              }}
              placeholder="#1A1A1A, #F2E8DC"
              value={hex}
            />
            {colors.length > 0 && badColor === undefined ? (
              <span aria-hidden="true" className="flex gap-1">
                {colors.map((color) => (
                  <span
                    className="border-border size-6 rounded-md border"
                    key={color}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </span>
            ) : null}
          </div>
          <FieldDescription id={`${id}-hex-help`}>
            {badColor === undefined
              ? t("hexHelp", { max: MAX_PALETTE })
              : t("hexInvalid", { color: badColor })}
          </FieldDescription>
        </Field>
      </details>
    </FieldSet>
  );
};

type Start = "auto" | "manual" | "questions";
const STARTS: { icon: LucideIcon; value: Start }[] = [
  { icon: Sparkles, value: "auto" },
  { icon: ListChecks, value: "questions" },
  { icon: CircleHelp, value: "manual" },
];

/** Suggest for me, Ask me a few questions, or I already know my brand. */
const StartChooser = ({
  onChange,
  value,
}: {
  onChange: (next: Start) => void;
  value: Start | undefined;
}) => {
  const t = useTranslations("Onboarding.brand.start");
  return (
    <ToggleGroup
      aria-label={t("label")}
      className="grid gap-2 sm:grid-cols-3"
      onValueChange={(next) => {
        const [first] = next;
        const found = STARTS.find((one) => one.value === first);
        if (found !== undefined) {
          onChange(found.value);
        }
      }}
      value={value === undefined ? [] : [value]}
    >
      {STARTS.map(({ icon: Icon, value: option }) => (
        <ToggleGroupItem
          className="aria-pressed:border-primary aria-pressed:bg-accent-soft h-full flex-col items-start justify-start gap-1 self-stretch rounded-xl border p-4 text-start whitespace-normal"
          key={option}
          value={option}
        >
          <span className="flex items-center gap-2 font-medium">
            <Icon aria-hidden="true" className="size-4" />
            {t(`${option}.title`)}
          </span>
          <span className="text-muted-foreground text-xs font-normal">
            {t(`${option}.body`)}
          </span>
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
};

const EMPTY_ANSWERS: Answers = { audiences: [], loves: [] };

/** Each reference's check, run once per spelling when its field loses focus. */
const useReferenceChecks = () => {
  const [states, setStates] = useState<Map<string, RefState>>(() => new Map());
  const setState = (key: string, state: RefState) =>
    setStates((current) => new Map(current).set(key, state));
  const check = async (reference: string) => {
    const key = keyOf(reference);
    if (key === "" || states.has(key)) {
      return;
    }
    setState(key, { kind: "checking" });
    // One call per reference, so each answer lands on its own field; a
    // failure was already reported by the server and shows as "couldn't
    // check" on the field.
    try {
      const [result] = await client.onboarding.resolveReferences({
        references: [reference.trim()],
      });
      setState(
        key,
        result === undefined ? { kind: "error" } : { kind: "done", result }
      );
    } catch {
      setState(key, { kind: "error" });
    }
  };
  // Qloo named these, so they're already placed.
  const markPlaced = (names: readonly string[]) =>
    setStates((current) => {
      const next = new Map(current);
      for (const name of names) {
        next.set(keyOf(name), {
          kind: "done",
          result: {
            entities: [],
            failed: false,
            reference: name,
            sources: [],
            status: "direct",
          },
        });
      }
      return next;
    });
  return { check, markPlaced, states };
};

/** The chooser, the questionnaire and the starter cards. */
const DiscoverySection = ({
  chosen,
  initial,
  onManual,
  onUse,
}: {
  chosen: string | undefined;
  initial: Start | undefined;
  onManual: () => void;
  onUse: (card: StarterCard) => void;
}) => {
  const [start, setStart] = useState<Start | undefined>(initial);
  const [round, setRound] = useState(0);
  const [answers, setAnswers] = useState<Answers>(EMPTY_ANSWERS);
  const discover = useMutation(orpc.onboarding.discover.mutationOptions());
  const runAuto = (nextRound: number) => {
    setRound(nextRound);
    discover.mutate({ mode: "auto", round: nextRound });
  };
  const runQuestions = () => discover.mutate({ answers, mode: "questions" });
  const asking =
    start === "questions" && discover.data === undefined && !discover.isPending;
  return (
    <div className="flex flex-col gap-4">
      <StartChooser
        onChange={(next) => {
          setStart(next);
          discover.reset();
          if (next === "auto") {
            runAuto(round);
          }
          if (next === "manual") {
            onManual();
          }
        }}
        value={start}
      />
      {asking ? (
        <Questionnaire
          answers={answers}
          busy={discover.isPending}
          onFinish={runQuestions}
          setAnswers={setAnswers}
        />
      ) : null}
      {start === "auto" || start === "questions" ? (
        <StarterCards
          chosen={chosen}
          error={discover.error}
          isPending={discover.isPending}
          onMore={
            start === "auto" ? () => runAuto(round + 1) : () => discover.reset()
          }
          onRetry={() => (start === "auto" ? runAuto(round) : runQuestions())}
          onUse={onUse}
          result={discover.data}
        />
      ) : null}
    </div>
  );
};

/** What the save button needs: the references and colours, checked. */
const saveState = (
  references: readonly string[],
  palette: CardPalette | undefined,
  hex: string
) => {
  const filled = filledOf(references);
  const hexColors = listOf(hex);
  const badColor = hexColors.find((color) => !HEX.test(color));
  const colors = palette?.inks ?? hexColors;
  const ready =
    filled.length >= MIN_REFERENCES &&
    (palette !== undefined || badColor === undefined) &&
    colors.length <= MAX_PALETTE;
  return { colors, filled, ready };
};

type BrandForm = ReturnType<typeof useBrandForm>;

/** The brand's own fields: niche, references, buyers, voice and colours. */
const BrandFields = ({
  chosen,
  discoveryOn,
  form,
  onSuggestRest,
  placed,
  refs,
  suggesting,
}: {
  chosen: StarterCard | undefined;
  discoveryOn: boolean;
  form: BrandForm;
  onSuggestRest: () => void;
  placed: string[];
  refs: ReturnType<typeof useReferenceChecks>;
  suggesting: boolean;
}) => {
  const t = useTranslations("Onboarding.brand");
  const id = useId();
  const {
    hex,
    niche,
    palette,
    references,
    setHex,
    setNiche,
    setPalette,
    setReferences,
    setVoice,
    voice,
  } = form;
  const { check, states } = refs;
  return (
    <div className="flex flex-col gap-6">
      <Field>
        <FieldHeading field="niche" htmlFor={`${id}-niche`} id={`${id}-n`} />
        <Input
          aria-describedby={`${id}-n-help`}
          className="h-10"
          id={`${id}-niche`}
          maxLength={60}
          onChange={(event) => setNiche(event.target.value)}
          placeholder={t("fields.niche.placeholder")}
          value={niche}
        />
        <SuggestionChips
          label={t("fields.niche.label")}
          onPick={setNiche}
          options={
            chosen === undefined
              ? []
              : [chosen.niche, ...chosen.nicheAlternatives].filter(
                  (one) => one !== niche
                )
          }
        />
      </Field>
      <ReferencesField
        alternatives={
          chosen?.referenceAlternatives.map((one) => one.name) ?? []
        }
        check={check}
        onSuggestRest={discoveryOn ? onSuggestRest : undefined}
        references={references}
        setReferences={setReferences}
        states={states}
        suggesting={suggesting}
      />
      {discoveryOn ? <BuyersPanelView references={placed} /> : null}
      <VoiceField
        lines={chosen?.voiceLines ?? []}
        setVoice={setVoice}
        voice={voice}
      />
      <PaletteField
        hex={hex}
        options={chosen?.palettes ?? []}
        palette={palette}
        setHex={setHex}
        setPalette={setPalette}
      />
      {discoveryOn ? (
        <p className="text-muted-foreground text-xs">{t("discover.credit")}</p>
      ) : null}
    </div>
  );
};

/** The brand's fields, starting from what was saved. */
const useBrandForm = (brand: OnboardingReady["brand"]) => {
  const [references, setReferences] = useState(() =>
    startingReferences(brand?.tasteReferences ?? [])
  );
  const [niche, setNiche] = useState((brand?.niches ?? []).join(", "));
  const [voice, setVoice] = useState(brand?.voice ?? "");
  const [palette, setPalette] = useState<CardPalette | undefined>();
  const [hex, setHex] = useState((brand?.palette ?? []).join(", "));
  return {
    hex,
    niche,
    palette,
    references,
    setHex,
    setNiche,
    setPalette,
    setReferences,
    setVoice,
    voice,
  };
};

/**
 * The brand step. A newcomer gets starter brands from Qloo (Suggest for me
 * or a few questions); picking one fills the niche, references, voice and
 * colours, which stay editable. "I already know my brand" keeps the manual
 * path. Saving writes the brand profile and wovain's memory.
 */
export const BrandStep = ({
  brand,
  onBack,
  onDone,
}: {
  brand: OnboardingReady["brand"];
  onBack: () => void;
  onDone: () => void;
}) => {
  const t = useTranslations("Onboarding.brand");
  const queryClient = useQueryClient();
  const status = useQuery(orpc.onboarding.status.queryOptions());
  const discoveryOn = status.data?.enabled === true && status.data.discovery;
  const hasBrand = (brand?.tasteReferences.length ?? 0) > 0;
  const [chosen, setChosen] = useState<StarterCard | undefined>();
  const [manual, setManual] = useState(hasBrand);
  const form = useBrandForm(brand);
  const refs = useReferenceChecks();

  const suggestRest = useMutation(
    orpc.onboarding.discover.mutationOptions({
      onError: (error) => toast.error(error.message),
      onSuccess: (result) => {
        const [card] = result.cards;
        if (card === undefined) {
          toast.message(t("discover.empty"));
          return;
        }
        setChosen(card);
      },
    })
  );

  const use = (card: StarterCard) => {
    setChosen(card);
    form.setNiche(card.niche);
    const names = card.references.map((reference) => reference.name);
    form.setReferences(startingReferences(names));
    refs.markPlaced(names);
    form.setVoice(card.voiceLines[0] ?? "");
    form.setPalette(card.palettes[0]);
    form.setHex("");
    toast.success(t("discover.applied", { name: card.name }));
  };

  const save = useMutation(
    orpc.onboarding.saveBrand.mutationOptions({
      onError: (error) => {
        toast.error(t("saveFailed", { message: error.message }));
      },
      onSuccess: async (data) => {
        if (!data.remembered) {
          toast.warning(t("notRemembered"));
        }
        await queryClient.invalidateQueries({
          queryKey: orpc.onboarding.key(),
        });
        onDone();
      },
    })
  );

  const { colors, filled, ready } = saveState(
    form.references,
    form.palette,
    form.hex
  );
  const placed = filled.filter((reference) => {
    const state = refs.states.get(keyOf(reference));
    return state?.kind === "done" && state.result.status !== "unresolved";
  });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!ready || save.isPending) {
      return;
    }
    // The server resolves the references with Qloo on save (reusing the
    // ones already looked up), so the saved entities match them.
    save.mutate({
      niches: listOf(form.niche),
      palette: colors,
      tasteReferences: filled,
      ...(form.voice.trim() === "" ? {} : { voice: form.voice.trim() }),
    });
  };

  const showForm = !discoveryOn || manual || chosen !== undefined;

  return (
    <TooltipProvider>
      <form className="flex flex-col gap-6" noValidate onSubmit={onSubmit}>
        <StepHeader lead={t("lead")} title={t("title")} />
        {discoveryOn ? (
          <DiscoverySection
            chosen={chosen?.key}
            initial={hasBrand ? "manual" : undefined}
            onManual={() => setManual(true)}
            onUse={use}
          />
        ) : null}
        {showForm ? (
          <BrandFields
            chosen={chosen}
            discoveryOn={discoveryOn}
            form={form}
            onSuggestRest={() =>
              suggestRest.mutate({ mode: "references", references: filled })
            }
            placed={placed}
            refs={refs}
            suggesting={suggestRest.isPending}
          />
        ) : null}
        <StepActions
          busyLabel={save.isPending ? t("saving") : undefined}
          onBack={onBack}
        >
          <div className="flex flex-wrap items-center gap-2">
            {showForm && filled.length < MIN_REFERENCES ? (
              <span className="text-muted-foreground text-xs">
                {t("needReferences")}
              </span>
            ) : null}
            <Button onClick={onDone} type="button" variant="ghost">
              {t("skip")}
            </Button>
            <NextButton disabled={!ready || save.isPending} type="submit">
              {t("save")}
            </NextButton>
          </div>
        </StepActions>
      </form>
    </TooltipProvider>
  );
};
