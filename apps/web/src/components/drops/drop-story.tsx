"use client";

import { useQuery } from "@tanstack/react-query";
import { Badge } from "@wovain/ui/components/badge";
import { Button, buttonVariants } from "@wovain/ui/components/button";
import { cn } from "@wovain/ui/lib/utils";
import { ArrowRight, ExternalLink } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { DropStylePanel } from "@/components/app/drop-style-panel";
import { IdeaDossier } from "@/components/app/idea-dossier";
import type { useDropFlow } from "@/components/app/use-drop-flow";
import { WhoBuysPanel } from "@/components/app/who-buys";
import type { QlooEvidence } from "@/components/drops/decided-by-qloo";
import { DecidedByQloo } from "@/components/drops/decided-by-qloo";
import type {
  DropSection,
  SectionState,
} from "@/components/drops/drop-sections";
import {
  DROP_SECTIONS,
  leadIdeaOf,
  pickedIdeaIdsOf,
  sectionState,
} from "@/components/drops/drop-sections";
import { RunTape, stageOf } from "@/components/product/run-tape";
import { Link } from "@/i18n/navigation";
import type { RunDetail } from "@/lib/flow-client";
import { namedWords } from "@/lib/flow-client";
import { orpc } from "@/utils/orpc";

type Drop = ReturnType<typeof useDropFlow>;
type Idea = RunDetail["ideas"][number];

const MAX_SOURCES = 3;
const MAX_NAMES = 3;
// Campaigns are staged for these countries unless the merchant says otherwise.
const DEFAULT_COUNTRIES = ["US"];

const STATE_VARIANT: Record<
  SectionState,
  "default" | "secondary" | "outline" | "destructive"
> = {
  done: "secondary",
  not_started: "outline",
  stopped: "destructive",
  waiting: "default",
  working: "outline",
};

const names = (items: readonly { name: string }[]) =>
  items
    .slice(0, MAX_NAMES)
    .map((item) => item.name)
    .join(", ");

/** One section of the drop page: a heading, its state, its Qloo mark, then its body. */
const Section = ({
  action,
  children,
  id,
  marker,
  state,
  title,
}: {
  action?: ReactNode;
  children: ReactNode;
  id: string;
  marker?: ReactNode;
  state?: SectionState | undefined;
  title: string;
}) => {
  const t = useTranslations("DropStory");
  return (
    <section
      aria-labelledby={`${id}-title`}
      className="border-border bg-card flex scroll-mt-20 flex-col gap-4 rounded-2xl border p-5 sm:p-6"
      id={id}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2
          className="font-display text-lg font-semibold tracking-[-0.015em]"
          id={`${id}-title`}
        >
          {title}
        </h2>
        {state === undefined ? null : (
          <Badge variant={STATE_VARIANT[state]}>{t(`state.${state}`)}</Badge>
        )}
        {marker}
        {action === undefined ? null : <div className="ms-auto">{action}</div>}
      </div>
      {children}
    </section>
  );
};

const NotAvailable = ({ reason }: { reason: string }) => {
  const t = useTranslations("DropStory");
  return (
    <p className="text-muted-foreground text-sm">
      {t("notAvailable", { reason })}
    </p>
  );
};

/** Why it sells: the Qloo theme, what is happening now and the sources. */
const WhySection = ({ lead }: { lead: Idea | undefined }) => {
  const t = useTranslations("DropStory.why");
  const format = useFormatter();
  if (lead === undefined) {
    return (
      <Section id="why" title={t("title")}>
        <NotAvailable reason={t("noIdea")} />
      </Section>
    );
  }
  const { research } = lead;
  const words = namedWords(lead);
  const { affinity } = research.signals;
  const evidence: QlooEvidence[] = [
    {
      label: t("affinity"),
      value:
        affinity === undefined
          ? t("affinityMissing")
          : format.number(affinity, { maximumFractionDigits: 2 }),
    },
    { label: t("news"), value: format.number(research.signals.newsHits) },
    { label: t("listings"), value: format.number(research.signals.marketHits) },
    { label: t("sources"), value: format.number(research.sources.length) },
  ];
  return (
    <Section
      id="why"
      marker={
        <DecidedByQloo
          decision={t("decision", { theme: lead.theme })}
          evidence={evidence}
        />
      }
      title={t("title")}
    >
      <div className="flex flex-col gap-2">
        {words ? (
          <h3 className="text-base font-semibold">{words.title}</h3>
        ) : null}
        {words ? <p className="max-w-[70ch] text-sm">{words.concept}</p> : null}
      </div>
      {/* The research report, started with the pick, tells why now with its
          sources; until it is done the idea's own why-now and sources stand
          in, so the two are never shown together. */}
      <IdeaDossier
        automatic
        fallback={
          <div className="flex flex-col gap-2">
            {words ? (
              <p className="max-w-[70ch] text-sm">{words.whyNow}</p>
            ) : (
              <NotAvailable reason={t("noMoment")} />
            )}
            {research.sources.length > 0 ? (
              <ol className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                {research.sources.slice(0, MAX_SOURCES).map((source, index) => (
                  <li key={source.url}>
                    <a
                      className="text-accent-text inline-flex min-h-6 max-w-64 items-center gap-1 font-semibold underline"
                      href={source.url}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      <span className="figures">[{index + 1}]</span>
                      <span className="truncate">{source.title}</span>
                      <ExternalLink
                        aria-hidden="true"
                        className="size-3 shrink-0"
                      />
                    </a>
                  </li>
                ))}
              </ol>
            ) : (
              <NotAvailable reason={t("noSources")} />
            )}
          </div>
        }
        ideaId={lead.id}
      />
    </Section>
  );
};

/** Who buys and where, from Qloo's audience for the lead idea. */
const WhoSection = ({ lead }: { lead: Idea | undefined }) => {
  const t = useTranslations("DropStory.who");
  // The same query <WhoBuysPanel /> reads, so the mark shares its answer.
  const whoBuys = useQuery({
    ...orpc.ideas.whoBuys.queryOptions({ input: { ideaId: lead?.id ?? "" } }),
    enabled: lead !== undefined,
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });
  if (lead === undefined) {
    return (
      <Section id="who" title={t("title")}>
        <NotAvailable reason={t("noIdea")} />
      </Section>
    );
  }
  const { data } = whoBuys;
  const evidence: QlooEvidence[] =
    data === undefined
      ? []
      : [
          ...(data.audiences.length > 0
            ? [{ label: t("audiences"), value: names(data.audiences) }]
            : []),
          ...(data.places.length > 0
            ? [{ label: t("places"), value: names(data.places) }]
            : []),
          ...(data.brands.length > 0
            ? [{ label: t("brands"), value: names(data.brands) }]
            : []),
        ];
  return (
    <Section
      id="who"
      marker={
        data === undefined ? null : (
          <DecidedByQloo
            decision={t("decision", { theme: lead.theme })}
            evidence={evidence}
          />
        )
      }
      title={t("title")}
    >
      <WhoBuysPanel embedded ideaId={lead.id} />
    </Section>
  );
};

/** Qloo's audience as Meta targeting: what the paused campaign reaches. */
const TargetingMark = () => {
  const t = useTranslations("DropStory.campaign");
  const preview = useQuery({
    ...orpc.targeting.preview.queryOptions({
      input: { countries: DEFAULT_COUNTRIES },
    }),
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });
  if (preview.data === undefined) {
    return null;
  }
  const { evidence } = preview.data;
  const ages =
    evidence.age === undefined
      ? undefined
      : t("ages", { max: evidence.age.max, min: evidence.age.min });
  return (
    <DecidedByQloo
      decision={t("decision")}
      evidence={[
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
        ...(ages === undefined ? [] : [{ label: t("agesLabel"), value: ages }]),
      ]}
    />
  );
};

// The figures a section summary may use: one shape for all four.
const summaryOf = (section: DropSection, run: RunDetail, picked: number) => {
  const counts: Record<DropSection, number> = {
    campaign: run.campaigns.length,
    designs: run.designs.length,
    ideas: run.ideas.length,
    products: run.products.length,
  };
  return {
    approved: run.designs.filter((one) => one.status === "approved").length,
    count: counts[section],
    picked,
  };
};

/**
 * One drop, read top to bottom (openspec story-ui): why it sells and who
 * buys it (Qloo), then ideas, designs, product, campaign and results. Each
 * section says where it stands; the step that needs the merchant opens in
 * its own section, and a done one can be reopened.
 */
export const DropStory = ({
  active,
  drop,
  notices,
}: {
  // The open step's panel, as the flow renders it.
  active: ReactNode;
  drop: Drop;
  // Live status, the autopilot note and any problem, above the sections.
  notices: ReactNode;
}) => {
  const t = useTranslations("DropStory");
  const status = useTranslations("Status");
  const format = useFormatter();
  const { run } = drop;
  if (run === undefined) {
    return (
      <div className="flex flex-col gap-6">
        {notices}
        {active}
      </div>
    );
  }
  const step = drop.step.id;
  const picked = pickedIdeaIdsOf(run, drop.picked);
  const lead = leadIdeaOf(run.ideas, picked);
  const failed = run.status === "failed";
  const finished = run.status === "completed";

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          {t("eyebrow")}
        </p>
        <h1 className="font-display text-2xl font-semibold tracking-[-0.025em] text-pretty sm:text-3xl">
          {run.seed}
        </h1>
        <p className="text-muted-foreground text-sm">
          {status(run.status)} ·{" "}
          {t("started", {
            date: format.dateTime(new Date(run.createdAt), {
              dateStyle: "medium",
            }),
          })}
        </p>
      </header>
      <RunTape finished={finished} stage={stageOf(run)} />
      {notices}
      {failed ? (
        <div className="border-border bg-card rounded-2xl border p-5 sm:p-8">
          {active}
        </div>
      ) : null}
      {/* Before a pick, each idea card carries its own why and who; the
          drop's sections tell them once, for the idea it makes. */}
      {picked.length > 0 ? (
        <>
          <WhySection lead={lead} />
          <WhoSection lead={lead} />
        </>
      ) : null}
      {DROP_SECTIONS.map((section) => {
        const state = sectionState(section, run);
        const open = step === section && !failed;
        const reopen = state === "done" && !open && !finished;
        return (
          <Section
            action={
              reopen ? (
                <Button
                  onClick={() => drop.actions.handleGoTo(section)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  {t("review")}
                </Button>
              ) : undefined
            }
            id={section}
            key={section}
            marker={
              section === "campaign" && state !== "not_started" ? (
                <TargetingMark />
              ) : null
            }
            state={state}
            title={t(`${section}.title`)}
          >
            {state === "not_started" ? (
              <p className="text-muted-foreground text-sm">
                {t(`${section}.notStarted`)}
              </p>
            ) : (
              <p className="text-muted-foreground text-sm">
                {t(
                  `${section}.summary`,
                  summaryOf(section, run, picked.length)
                )}
              </p>
            )}
            {open ? active : null}
            {/* Stopped before a design was drawn: the tone and colours stay
                open to review before trying again. */}
            {section === "designs" &&
            state === "stopped" &&
            run.designs.length === 0
              ? picked.map((ideaId) => (
                  <DropStylePanel ideaId={ideaId} key={ideaId} />
                ))
              : null}
          </Section>
        );
      })}
      <Section id="results" title={t("results.title")}>
        {run.campaigns.length > 0 ? (
          <Link
            className={cn(
              buttonVariants({ variant: "outline" }),
              "h-9 w-fit px-4"
            )}
            href={{ pathname: "/dashboard/campaign", query: { run: run.id } }}
          >
            {t("results.open")}
            <ArrowRight aria-hidden="true" data-icon="inline-end" />
          </Link>
        ) : (
          <p className="text-muted-foreground text-sm">
            {t("results.notStarted")}
          </p>
        )}
        {step === "done" && !failed ? active : null}
      </Section>
    </div>
  );
};
