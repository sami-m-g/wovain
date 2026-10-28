"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@wovain/ui/components/badge";
import { Button } from "@wovain/ui/components/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@wovain/ui/components/field";
import { Input } from "@wovain/ui/components/input";
import { Spinner } from "@wovain/ui/components/spinner";
import { Plus, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import type { FormEvent } from "react";
import { useId, useState } from "react";
import { toast } from "sonner";

import {
  NextButton,
  StepActions,
  StepHeader,
} from "@/components/app/wizard-parts";
import type { OnboardingReady, ResolvedReference } from "@/lib/flow-client";
import { orpc } from "@/utils/orpc";

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

const startingReferences = (saved: readonly string[]) => [
  ...saved,
  ...Array.from(
    { length: Math.max(0, MIN_REFERENCES - saved.length) },
    () => ""
  ),
];

/** What Qloo made of one reference: its entities, or that it found none. */
const ReferenceResult = ({ result }: { result: ResolvedReference }) => {
  const t = useTranslations("Onboarding.brand");
  return (
    <li className="border-border flex flex-col gap-2 rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{result.reference}</span>
        <Badge
          variant={result.status === "unresolved" ? "outline" : "secondary"}
        >
          {t(`status.${result.status}`)}
        </Badge>
      </div>
      {result.entities.length > 0 ? (
        <ul aria-label={t("entities")} className="flex flex-wrap gap-1.5">
          {result.entities.map((entity) => (
            <li key={entity.id}>
              <Badge variant="outline">{entity.name}</Badge>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground text-sm">
          {result.failed ? t("failed") : t("notFound")}
        </p>
      )}
      {result.sources.length > 0 ? (
        <p className="text-muted-foreground text-xs">
          {t("readFrom")}{" "}
          {result.sources.map((source, index) => (
            <span key={source.url ?? source.title ?? source.provider}>
              {index > 0 ? ", " : null}
              <a
                className="underline underline-offset-2"
                href={source.url}
                rel="noopener noreferrer"
                target="_blank"
              >
                {source.title ?? source.url}
              </a>
            </span>
          ))}
        </p>
      ) : null}
    </li>
  );
};

/** The 3 to 5 references and what Qloo found for each. */
const ReferencesField = ({
  onResolved,
  references,
  results,
  setReferences,
}: {
  onResolved: (results: ResolvedReference[]) => void;
  references: string[];
  results: ResolvedReference[] | undefined;
  setReferences: (next: string[]) => void;
}) => {
  const t = useTranslations("Onboarding.brand");
  const id = useId();
  const filled = filledOf(references);
  const resolve = useMutation(
    orpc.onboarding.resolveReferences.mutationOptions({
      onError: (error) => {
        toast.error(t("resolveFailed", { message: error.message }));
      },
      onSuccess: onResolved,
    })
  );

  return (
    <FieldSet>
      <FieldLegend>{t("referencesLegend")}</FieldLegend>
      <FieldDescription>{t("referencesHelp")}</FieldDescription>
      <FieldGroup className="gap-3">
        {references.map((value, index) => (
          // The inputs never reorder, so their position is their identity.
          // oxlint-disable-next-line react/no-array-index-key
          <Field key={index}>
            <FieldLabel className="sr-only" htmlFor={`${id}-ref-${index}`}>
              {t("referenceLabel", { number: index + 1 })}
            </FieldLabel>
            <Input
              autoComplete="off"
              className="h-10"
              id={`${id}-ref-${index}`}
              maxLength={120}
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
            {t("addReference")}
          </Button>
        ) : null}
        <Button
          className="h-10 sm:h-9"
          disabled={filled.length === 0 || resolve.isPending}
          onClick={() => resolve.mutate({ references: filled })}
          type="button"
          variant="outline"
        >
          {resolve.isPending ? (
            <Spinner aria-hidden="true" data-icon="inline-start" />
          ) : (
            <Search aria-hidden="true" data-icon="inline-start" />
          )}
          {resolve.isPending ? t("resolving") : t("resolve")}
        </Button>
      </div>
      <div aria-live="polite">
        {results === undefined ? null : (
          <ul className="flex flex-col gap-2">
            {results.map((result) => (
              <ReferenceResult key={result.reference} result={result} />
            ))}
          </ul>
        )}
      </div>
    </FieldSet>
  );
};

/** Hex colors, comma separated, with swatches. */
const PaletteField = ({
  badColor,
  colors,
  onChange,
  value,
}: {
  badColor: string | undefined;
  colors: string[];
  onChange: (value: string) => void;
  value: string;
}) => {
  const t = useTranslations("Onboarding.brand");
  const id = useId();
  const invalid = badColor === undefined ? undefined : true;
  return (
    <Field data-invalid={invalid}>
      <FieldLabel htmlFor={`${id}-palette`}>{t("paletteLabel")}</FieldLabel>
      <Input
        aria-describedby={`${id}-palette-help`}
        aria-invalid={invalid}
        className="h-10 font-mono"
        id={`${id}-palette`}
        onChange={(event) => onChange(event.target.value)}
        placeholder="#1A1A1A, #F2E8DC"
        value={value}
      />
      <FieldDescription id={`${id}-palette-help`}>
        {badColor === undefined
          ? t("paletteHelp", { max: MAX_PALETTE })
          : t("paletteInvalid", { color: badColor })}
      </FieldDescription>
      {colors.length > 0 && badColor === undefined ? (
        <div aria-hidden="true" className="flex gap-1.5">
          {colors.map((color) => (
            <span
              className="border-border size-6 rounded-md border"
              key={color}
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
      ) : null}
    </Field>
  );
};

/**
 * The brand step: 3 to 5 taste references Qloo resolves, then the voice,
 * palette and niches. Saving writes the brand profile and wovain's memory.
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
  const id = useId();
  const queryClient = useQueryClient();
  const [references, setReferences] = useState(() =>
    startingReferences(brand?.tasteReferences ?? [])
  );
  const [voice, setVoice] = useState(brand?.voice ?? "");
  const [palette, setPalette] = useState((brand?.palette ?? []).join(", "));
  const [niches, setNiches] = useState((brand?.niches ?? []).join(", "));
  const [results, setResults] = useState<ResolvedReference[] | undefined>();

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

  const filled = filledOf(references);
  const colors = listOf(palette);
  const badColor = colors.find((color) => !HEX.test(color));
  const canSave =
    filled.length >= MIN_REFERENCES &&
    badColor === undefined &&
    colors.length <= MAX_PALETTE &&
    !save.isPending;

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!canSave) {
      return;
    }
    save.mutate({
      niches: listOf(niches),
      palette: colors,
      qlooEntities:
        results === undefined
          ? (brand?.qlooEntities ?? [])
          : results.flatMap((result) => result.entities),
      tasteReferences: filled,
      ...(voice.trim() === "" ? {} : { voice: voice.trim() }),
    });
  };

  return (
    <form className="flex flex-col gap-6" noValidate onSubmit={onSubmit}>
      <StepHeader lead={t("lead")} title={t("title")} />
      <ReferencesField
        onResolved={setResults}
        references={references}
        results={results}
        setReferences={setReferences}
      />
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor={`${id}-voice`}>{t("voiceLabel")}</FieldLabel>
          <Input
            className="h-10"
            id={`${id}-voice`}
            maxLength={200}
            onChange={(event) => setVoice(event.target.value)}
            placeholder={t("voicePlaceholder")}
            value={voice}
          />
        </Field>
        <PaletteField
          badColor={badColor}
          colors={colors}
          onChange={setPalette}
          value={palette}
        />
        <Field>
          <FieldLabel htmlFor={`${id}-niches`}>{t("nichesLabel")}</FieldLabel>
          <Input
            className="h-10"
            id={`${id}-niches`}
            onChange={(event) => setNiches(event.target.value)}
            placeholder={t("nichesPlaceholder")}
            value={niches}
          />
        </Field>
      </FieldGroup>
      <StepActions
        busyLabel={save.isPending ? t("saving") : undefined}
        onBack={onBack}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={onDone} type="button" variant="ghost">
            {t("skip")}
          </Button>
          <NextButton disabled={!canSave} type="submit">
            {t("save")}
          </NextButton>
        </div>
      </StepActions>
    </form>
  );
};
