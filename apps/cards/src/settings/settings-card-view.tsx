import { Button } from "@openai/apps-sdk-ui/components/Button";
import {
  BarChart,
  ChevronDown,
  DollarCircle,
  Music,
  SettingsSlider,
  ShieldCheck,
  Tag,
  Trending,
  Video,
  VideoCaption,
} from "@openai/apps-sdk-ui/components/Icon";
import { Input } from "@openai/apps-sdk-ui/components/Input";
import { SegmentedControl } from "@openai/apps-sdk-ui/components/SegmentedControl";
import { Switch } from "@openai/apps-sdk-ui/components/Switch";
import { settingsSchema } from "@wovain/shared";
import type { Settings } from "@wovain/shared";
import { useId, useState } from "react";
import type { ComponentType, SVGProps } from "react";
import type { z } from "zod";

import { mainSections, moreSections } from "./fields.ts";
import type { FieldSpec, Section } from "./fields.ts";
import type { Draft, WidgetState } from "./state.ts";

type Status = "idle" | "saving" | "saved" | "error";

const icons: Record<string, ComponentType<SVGProps<SVGSVGElement>>> = {
  audio: Music,
  budget: DollarCircle,
  economics: BarChart,
  meta: SettingsSlider,
  overlay: VideoCaption,
  pricing: Tag,
  rules: ShieldCheck,
  trends: Trending,
  video: Video,
};

const toDraft = (settings: Settings): Draft =>
  Object.fromEntries(
    Object.entries(settings).map(([group, values]) => [group, { ...values }])
  );

const friendlyIssue = (issue: z.core.$ZodIssue) => {
  if (issue.code === "invalid_type") {
    return "Enter a value";
  }
  if (issue.code === "too_small") {
    return `Must be at least ${String(issue.minimum)}`;
  }
  if (issue.code === "too_big") {
    return `Must be at most ${String(issue.maximum)}`;
  }
  return issue.message;
};

const statusText = (status: Status, dirty: boolean, valid: boolean) => {
  if (status === "saving") {
    return "Saving…";
  }
  if (status === "error") {
    return "Couldn’t save. Your edits are still here, so try again.";
  }
  if (!valid) {
    return "Fix the values marked in red to save.";
  }
  if (dirty) {
    return "Unsaved changes.";
  }
  if (status === "saved") {
    return "Saved. New cards use this right away.";
  }
  return "";
};

const adornment = (field: FieldSpec) => {
  if (field.kind === "money") {
    return { start: "$" };
  }
  if (field.kind === "percent") {
    return { end: "%" };
  }
  if (field.kind === "multiple") {
    return { end: "× breakeven" };
  }
  if (field.kind === "number" && field.unit !== undefined) {
    return { end: field.unit };
  }
  return {};
};

const Field = ({
  error,
  field,
  onChange,
  value,
}: {
  error: string | undefined;
  field: FieldSpec;
  onChange: (value: unknown) => void;
  value: unknown;
}) => {
  const id = useId();

  if (field.kind === "toggle") {
    return (
      <Switch
        checked={value === true}
        className="justify-between text-sm sm:col-span-2"
        label={field.label}
        labelPosition="start"
        onCheckedChange={onChange}
      />
    );
  }

  const label = (
    <label className="text-secondary text-sm" htmlFor={id}>
      {field.label}
    </label>
  );
  const errorText =
    error === undefined ? null : (
      <p className="text-danger text-xs" id={`${id}-error`}>
        {error}
      </p>
    );

  if (field.kind === "choice") {
    return (
      <div className="flex flex-col gap-1.5">
        <span aria-hidden className="text-secondary text-sm">
          {field.label}
        </span>
        <SegmentedControl
          aria-label={field.label}
          onChange={onChange}
          size="sm"
          value={typeof value === "string" ? value : ""}
        >
          {field.options.map((option) => (
            <SegmentedControl.Option key={option.value} value={option.value}>
              {option.label}
            </SegmentedControl.Option>
          ))}
        </SegmentedControl>
        {errorText}
      </div>
    );
  }

  const { end, start } = adornment(field);
  const suffix =
    end === undefined ? undefined : (
      <span className="whitespace-nowrap">{end}</span>
    );
  const numeric = field.kind !== "text";
  return (
    <div className="flex flex-col gap-1.5">
      {label}
      <Input
        aria-describedby={error === undefined ? undefined : `${id}-error`}
        endAdornment={suffix}
        id={id}
        inputMode={numeric ? "decimal" : "text"}
        invalid={error !== undefined}
        onChange={(event) => {
          const raw = event.target.value;
          onChange(numeric && raw.trim() !== "" ? Number(raw) : raw);
        }}
        startAdornment={start}
        type={numeric ? "number" : "text"}
        value={
          typeof value === "number" || typeof value === "string" ? value : ""
        }
        {...(numeric && {
          max: "max" in field ? field.max : undefined,
          min: "min" in field ? field.min : undefined,
          step: "step" in field ? field.step : undefined,
        })}
      />
      {errorText}
    </div>
  );
};

const SectionRow = ({
  draft,
  errors,
  isOpen,
  onChange,
  onToggle,
  saved,
  section,
}: {
  draft: Draft;
  errors: Map<string, string>;
  isOpen: boolean;
  onChange: (key: string, value: unknown) => void;
  onToggle: () => void;
  saved: Settings;
  section: Section;
}) => {
  const panelId = useId();
  const Icon = icons[section.id] ?? SettingsSlider;
  const values = draft[section.group] ?? {};
  const hasError = section.fields.some((field) =>
    errors.has(`${section.group}.${field.key}`)
  );

  return (
    <div className="border-subtle border-t first:border-t-0">
      <button
        aria-controls={panelId}
        aria-expanded={isOpen}
        className="flex w-full items-center gap-3 py-3 text-left"
        onClick={onToggle}
        type="button"
      >
        <Icon aria-hidden className="text-accent-icon size-4 shrink-0" />
        <span className="text-sm font-medium">{section.title}</span>
        <span
          className={`ml-auto truncate text-right text-sm ${hasError ? "text-danger" : "text-secondary"}`}
        >
          {hasError ? "Needs a fix" : section.summary(saved)}
        </span>
        <ChevronDown
          aria-hidden
          className={`text-tertiary size-4 shrink-0 transition-transform duration-200 ease-out ${isOpen ? "rotate-180" : ""}`}
        />
      </button>
      {isOpen ? (
        <div className="grid gap-3 pb-4 sm:grid-cols-2" id={panelId}>
          {section.fields.map((field) => (
            <Field
              error={errors.get(`${section.group}.${field.key}`)}
              field={field}
              key={field.key}
              onChange={(value) => {
                onChange(field.key, value);
              }}
              value={values[field.key]}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
};

export interface SettingsCardViewProps {
  initialState?: WidgetState | undefined;
  onRemember?: (state: WidgetState) => void;
  onSave: (settings: Settings) => Promise<Settings>;
  settings: Settings;
}

// The card without the host bridge, so Storybook can render every state.
export const SettingsCardView = ({
  initialState,
  onRemember,
  onSave,
  settings,
}: SettingsCardViewProps) => {
  const [saved, setSaved] = useState(settings);
  const [edits, setEdits] = useState<Draft | undefined>(initialState?.draft);
  const [open, setOpen] = useState<string[]>(initialState?.open ?? []);
  const [status, setStatus] = useState<Status>("idle");

  const remember = (draft: Draft | undefined, nextOpen: string[]) => {
    onRemember?.({ draft, open: nextOpen });
  };

  const draft = edits ?? toDraft(saved);
  const parsed = settingsSchema.safeParse(draft);
  const errors = new Map(
    parsed.success
      ? []
      : parsed.error.issues.map((issue) => [
          issue.path.slice(0, 2).join("."),
          friendlyIssue(issue),
        ])
  );
  const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(saved));
  const canSave = parsed.success && dirty && status !== "saving";

  const toggle = (id: string) => {
    const nextOpen = open.includes(id)
      ? open.filter((item) => item !== id)
      : [...open, id];
    setOpen(nextOpen);
    remember(edits, nextOpen);
  };

  const change = (group: string, key: string, value: unknown) => {
    const nextDraft = { ...draft, [group]: { ...draft[group], [key]: value } };
    setEdits(nextDraft);
    setStatus("idle");
    remember(nextDraft, open);
  };

  const save = async () => {
    if (!parsed.success) {
      return;
    }
    setStatus("saving");
    try {
      setSaved(await onSave(parsed.data));
      setEdits(undefined);
      setStatus("saved");
      remember(undefined, open);
    } catch {
      setStatus("error");
    }
  };

  const openSet = new Set(open);
  const rows = (sections: Section[]) =>
    sections.map((section) => (
      <SectionRow
        draft={draft}
        errors={errors}
        isOpen={openSet.has(section.id)}
        key={section.id}
        onChange={(key, value) => {
          change(section.group, key, value);
        }}
        onToggle={() => {
          toggle(section.id);
        }}
        saved={saved}
        section={section}
      />
    ));

  const moreOpen = openSet.has("more");

  return (
    <section aria-labelledby="settings-title" className="p-4">
      <h2 className="heading-sm" id="settings-title">
        wovain settings
      </h2>
      <p className="text-secondary mt-1 text-sm">
        Change anything here, and new cards use it right away.
      </p>

      <div className="mt-3">{rows(mainSections)}</div>

      <div className="border-subtle border-t">
        <button
          aria-expanded={moreOpen}
          className="text-secondary flex w-full items-center gap-2 py-3 text-left text-sm"
          onClick={() => {
            toggle("more");
          }}
          type="button"
        >
          More settings
          <ChevronDown
            aria-hidden
            className={`size-4 transition-transform duration-200 ease-out ${moreOpen ? "rotate-180" : ""}`}
          />
        </button>
        {moreOpen ? <div className="pl-2">{rows(moreSections)}</div> : null}
      </div>

      <div className="border-subtle mt-2 flex items-center justify-between gap-3 border-t pt-4">
        <p aria-live="polite" className="text-secondary text-sm">
          {statusText(status, dirty, parsed.success)}
        </p>
        <Button
          className="wovain-accent"
          color="primary"
          disabled={!canSave}
          loading={status === "saving"}
          onClick={() => {
            void save();
          }}
        >
          Save
        </Button>
      </div>
    </section>
  );
};
