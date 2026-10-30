"use client";

import type { IdeaCard } from "@wovain/core/idea-card";
import { Badge } from "@wovain/ui/components/badge";
import { Button } from "@wovain/ui/components/button";
import { Card } from "@wovain/ui/components/card";
import { cn } from "@wovain/ui/lib/utils";
import {
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  House,
  Layers,
  MousePointer2,
  PanelLeft,
  Pause,
  Play,
  Settings,
  ShieldCheck,
  Sun,
} from "lucide-react";
import {
  animate,
  AnimatePresence,
  LayoutGroup,
  motion,
  useInView,
  useMotionValue,
  useReducedMotion,
} from "motion/react";
import { useFormatter, useTranslations } from "next-intl";
import Image from "next/image";
import type { ReactNode, RefObject } from "react";
import {
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
} from "react";

import { Logo } from "@/components/brand/logo";
import { ShuttleLoader, ShuttleMark } from "@/components/brand/shuttle-mark";
import { IdeaCardView } from "@/components/ideas/idea-card-view";
import {
  AdPreview,
  MOCKUPS,
  PausedBadge,
  ProductListing,
} from "@/components/marketing/demo-pieces";
import { HangTag } from "@/components/product/hang-tag";
import { RunTape, STAGE_COUNT, STAGES } from "@/components/product/run-tape";
import type { Stage } from "@/components/product/run-tape";
import type { PriceBreakdown } from "@/lib/pricing";

/** The clock the whole sequence runs on, in milliseconds. */
const TICK = 50;
const EXPO_OUT = [0.16, 1, 0.3, 1] as const;

// Beats inside each scene, in milliseconds from the scene's start.
const IDEA_SCROLL_START = 900;
const IDEA_SCROLL_MS = 4200;
const IDEA_CURSOR = 5400;
const IDEA_CLICK = 6300;
const REVIEW_CURSOR = 2600;
const REVIEW_CLICK = 3500;
/** When each of the three design jobs ticks off, inside the working beat. */
const MAKE_DONE = [800, 1700, 2600] as const;
const DESIGN_CURSOR = 1500;
const DESIGN_CLICK = 2400;
const DESIGN_FOCUS = 3000;
const PUBLISH_CURSOR = 1800;
const PUBLISH_CLICK = 2700;
const VIDEO_IN = 900;
const RULES_IN = 1600;
const PAUSED_IN = 3000;
const PRESS_MS = 220;
/** Ideas in the example's carousel, for its "1 of 5". */
const IDEAS_SHOWN = 5;
/** The example's spend rules, in US dollars: the defaults a new seller gets. */
const DAILY_CAP = 10;
const MONTHLY_CAP = 150;
const LOSS_LIMIT = 50;
/** Where the cursor enters, as a share of the frame, and how it moves. */
const CURSOR_ENTRY = { x: 0.88, y: 0.96 } as const;
const CURSOR_GLIDE = 0.75;
const CURSOR_PRESS = 0.82;

type Scene = "home" | "review" | "designs" | "publish" | "campaign";
type Work = "designs" | "products" | "campaign";

type Beat =
  | { kind: "scene"; scene: Scene; ms: number }
  | { kind: "work"; work: Work; ms: number };

/**
 * The choreography, as the app runs it today: an idea picked on Home, its
 * tone and colours, the designs, publishing to Fourthwall and the campaign
 * built paused. About 35 seconds.
 */
const SEQUENCE: readonly Beat[] = [
  { kind: "scene", ms: 7600, scene: "home" },
  { kind: "scene", ms: 4600, scene: "review" },
  { kind: "work", ms: 3400, work: "designs" },
  { kind: "scene", ms: 4300, scene: "designs" },
  { kind: "work", ms: 1100, work: "products" },
  { kind: "scene", ms: 4400, scene: "publish" },
  { kind: "work", ms: 1300, work: "campaign" },
  { kind: "scene", ms: 8500, scene: "campaign" },
];

const FINAL: Beat = { kind: "scene", ms: 0, scene: "campaign" };
const FINAL_ELAPSED = 99_999;

/** Where each beat sits on the drop's tape; Home is before the drop. */
const STAGE_OF: Record<Exclude<Scene, "home"> | Work, Stage> = {
  campaign: "campaign",
  designs: "designs",
  products: "products",
  publish: "products",
  review: "designs",
};

const TITLE_OF = {
  campaign: "campaign.title",
  designs: "designs.title",
  products: "products.title",
  publish: "products.title",
  review: "designs.reviewTitle",
} as const satisfies Record<Exclude<Scene, "home"> | Work, string>;

/** The dashboard's own rail, in its order. */
const NAV = [
  { icon: House, key: "home" },
  { icon: Layers, key: "drops" },
  { icon: Settings, key: "settings" },
] as const;

const DESIGNS = [
  { mockup: MOCKUPS.fern, score: 88 },
  { mockup: MOCKUPS.garden, score: 61 },
  { mockup: MOCKUPS.balcony, score: 82 },
  { mockup: MOCKUPS.seeds, score: 79 },
] as const;
const READY_SCORE = 75;

/** The example's colour sets: the tee, then the inks checked against it. */
const PALETTES = [
  { garment: "#1f1d1b", inks: ["#efe6d2", "#9bb07a"] },
  { garment: "#a3ad8f", inks: ["#2b3a26", "#f4efe2"] },
  { garment: "#efe7d8", inks: ["#3f5a3a", "#b0603a"] },
] as const;

interface Clock {
  index: number;
  elapsed: number;
}

const advance = (clock: Clock): Clock => {
  const elapsed = clock.elapsed + TICK;
  const beat = SEQUENCE[clock.index];
  if (beat && elapsed < beat.ms) {
    return { ...clock, elapsed };
  }
  return { elapsed: 0, index: (clock.index + 1) % SEQUENCE.length };
};

const enter = (delay = 0) => ({
  animate: { opacity: 1, y: 0 },
  initial: { opacity: 0, y: 10 },
  transition: { delay, duration: 0.5, ease: EXPO_OUT },
});

const pressedAt = (elapsed: number, click: number) =>
  elapsed >= click && elapsed < click + PRESS_MS;

/** The pointer that walks the visitor's hand through the flow. */
const Cursor = ({
  frame,
  target,
  phase,
}: {
  frame: RefObject<HTMLDivElement | null>;
  target: RefObject<HTMLElement | null>;
  phase: "hidden" | "moving" | "pressed";
}) => {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const visible = phase !== "hidden";
  // Measure the button the cursor is heading for, enter from the lower
  // corner and glide onto it: Motion values, so no re-render per frame.
  useLayoutEffect(() => {
    if (!visible || !frame.current || !target.current) {
      return;
    }
    const box = frame.current.getBoundingClientRect();
    const spot = target.current.getBoundingClientRect();
    x.jump(box.width * CURSOR_ENTRY.x);
    y.jump(box.height * CURSOR_ENTRY.y);
    const glide = { duration: CURSOR_GLIDE, ease: EXPO_OUT };
    const toX = animate(x, spot.left - box.left + spot.width / 2, glide);
    const toY = animate(y, spot.top - box.top + spot.height / 2, glide);
    return () => {
      toX.stop();
      toY.stop();
    };
  }, [frame, target, visible, x, y]);
  return (
    <motion.div
      animate={{
        opacity: visible ? 1 : 0,
        scale: phase === "pressed" ? CURSOR_PRESS : 1,
      }}
      className="pointer-events-none absolute start-0 top-0 z-20 -ms-1 -mt-1 rtl:hidden"
      initial={false}
      style={{ x, y }}
      transition={{
        opacity: { duration: 0.25 },
        scale: { duration: 0.12 },
      }}
    >
      <MousePointer2 className="text-foreground fill-background size-5 drop-shadow-sm" />
    </motion.div>
  );
};

/** A button drawn as the app draws it, pressed when the cursor clicks. */
const DemoButton = ({
  children,
  pressed,
  primary = false,
  ref,
  className,
}: {
  children: ReactNode;
  pressed?: boolean;
  primary?: boolean;
  ref?: RefObject<HTMLButtonElement | null>;
  className?: string;
}) => (
  <motion.span
    animate={{ scale: pressed ? 0.95 : 1 }}
    className={cn("inline-flex", className)}
    transition={{ duration: 0.12 }}
  >
    <Button
      className="pointer-events-none h-8 w-full text-xs"
      ref={ref}
      size="sm"
      tabIndex={-1}
      variant={primary ? "default" : "outline"}
    >
      {children}
    </Button>
  </motion.span>
);

interface IdeaCopy {
  title: string;
  concept: string;
  buyer: string;
  style: string;
  tag: string;
  sentence: string;
  gender: string;
  interests: string[];
  places: string[];
  gap: string;
  sources: string[];
}

const ok = <T,>(value: T) => ({ status: "ok", value }) as const;

/** The example idea, as the app's own idea card reads it. */
const exampleCard = (copy: IdeaCopy): IdeaCard => ({
  audience: ok({
    ages: ["25-34", "35-44"],
    agesScope: "idea",
    alsoLikes: [],
    gender: copy.gender,
    interests: copy.interests,
    places: copy.places.map((name) => ({ affinity: 0.8, name })),
    scope: "idea",
  }),
  competition: ok({
    advertisers: 7,
    citations: [],
    gaps: [copy.gap],
    level: "sweet-spot",
    listings: 12,
    medianPrice: 28,
    sampled: 60,
  }),
  make: ok({
    brief: copy.concept,
    buyer: copy.buyer,
    concept: copy.concept,
    products: ["t-shirt"],
    style: copy.style,
    title: copy.title,
  }),
  origin: "trends",
  why: ok({
    affinity: 0.82,
    citations: copy.sources.map((title, index) => ({
      title,
      url: `https://example.com/source-${index + 1}`,
    })),
    demand: ok({
      ads: ok({
        advertisers: 7,
        evergreen: 2,
        longestDays: 41,
        samples: [],
        validated: 5,
      }),
      market: ok({ bestsellers: 6, listings: [], reviews: 312 }),
      proven: true,
    }),
    qloo: { affinity: 0.82, entities: [] },
    qlooTag: { name: copy.tag },
    sentence: copy.sentence,
    trend: { news: 14 },
  }),
});

/**
 * Home: what sells now, one idea card at a time, read top to bottom as it
 * scrolls. Then the seller starts a drop from it.
 */
const HomeScene = ({
  elapsed,
  target,
}: {
  elapsed: number;
  target: RefObject<HTMLButtonElement | null>;
}) => {
  const t = useTranslations("Home");
  const directions = useTranslations("Wizard.directions");
  const box = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState(0);
  useLayoutEffect(() => {
    if (box.current && inner.current) {
      setOverflow(
        Math.max(0, inner.current.offsetHeight - box.current.clientHeight)
      );
    }
  }, []);
  const read = Math.min(
    1,
    Math.max(0, (elapsed - IDEA_SCROLL_START) / IDEA_SCROLL_MS)
  );
  const picked = elapsed >= IDEA_CLICK;
  return (
    <motion.div className="flex h-full flex-col gap-2" {...enter()}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-muted-foreground truncate text-xs">
          {t("demo.homeLead")}
        </p>
        <span className="text-muted-foreground flex shrink-0 items-center gap-1 text-xs">
          <ChevronLeft className="size-3.5 rtl:rotate-180" />
          <span className="figures">
            {directions("carousel.position", {
              current: "1",
              total: String(IDEAS_SHOWN),
            })}
          </span>
          <ChevronRight className="size-3.5 rtl:rotate-180" />
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden" ref={box}>
        <div
          className="transition-transform duration-100 ease-linear"
          ref={inner}
          style={{ transform: `translateY(${-overflow * read}px)` }}
        >
          <Card className={cn("p-4", picked && "ring-primary ring-2")}>
            <IdeaCardView card={exampleCard(t.raw("demo.idea") as IdeaCopy)}>
              <DemoButton
                className="w-fit"
                pressed={pressedAt(elapsed, IDEA_CLICK)}
                primary
                ref={target}
              >
                {directions("use")}
                <ArrowRight data-icon="inline-end" />
              </DemoButton>
            </IdeaCardView>
          </Card>
        </div>
      </div>
    </motion.div>
  );
};

interface ToneCopy {
  label: string;
  line: string;
}

/**
 * Designs, before anything is drawn: the research report wovain ran on its
 * own, and the tone and colours suggested from the buyers. Then "Make
 * designs".
 */
const ReviewScene = ({
  elapsed,
  target,
}: {
  elapsed: number;
  target: RefObject<HTMLButtonElement | null>;
}) => {
  const t = useTranslations("Home");
  const evidence = useTranslations("Wizard.evidence");
  const style = useTranslations("Wizard.style");
  const designs = useTranslations("Wizard.designs");
  const report = [
    { label: evidence("whyNow"), value: t("demo.report.whyNow") },
    { label: evidence("saturation"), value: t("demo.report.saturation") },
    { label: evidence("priceBand"), value: t("demo.report.price") },
  ];
  const tones = t.raw("demo.tones") as ToneCopy[];
  const colours = t.raw("demo.colours") as string[];
  return (
    <motion.div className="flex flex-col gap-3" {...enter()}>
      <section className="border-border flex flex-col gap-2 rounded-lg border p-3">
        <h4 className="flex items-center gap-1.5 text-xs font-semibold">
          {evidence("dossierTitle")}
          <Badge className="h-5 text-[0.65rem]" variant="secondary">
            {t("demo.report.sources")}
          </Badge>
        </h4>
        <dl className="flex flex-col gap-1.5">
          {report.map((row, index) => (
            <div
              className={cn(
                "grid gap-x-3 sm:grid-cols-[7.5rem_minmax(0,1fr)]",
                index > 0 && "max-sm:hidden"
              )}
              key={row.label}
            >
              <dt className="text-muted-foreground text-[0.7rem] font-medium">
                {row.label}
              </dt>
              <dd className="truncate text-xs">{row.value}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section className="bg-muted/40 grid gap-3 rounded-lg p-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <h4 className="text-xs font-semibold">{style("tone")}</h4>
          {tones.map((tone, index) => (
            <span
              className={cn(
                "flex flex-col gap-0.5 rounded-md border px-2.5 py-1.5",
                index === 0 ? "border-primary bg-accent-soft" : "border-border"
              )}
              key={tone.label}
            >
              <span className="text-xs font-medium">{tone.label}</span>
              <span className="text-muted-foreground truncate text-[0.7rem]">
                “{tone.line}”
              </span>
            </span>
          ))}
        </div>
        <div className="flex flex-col gap-1.5 max-sm:hidden">
          <h4 className="text-xs font-semibold">{style("colours")}</h4>
          <div className="flex flex-wrap gap-1.5">
            {PALETTES.map((palette, index) => (
              <span
                className={cn(
                  "flex flex-col items-start gap-1 rounded-md border p-1.5",
                  index === 0
                    ? "border-primary bg-accent-soft"
                    : "border-border"
                )}
                key={palette.garment}
              >
                <span
                  className="border-border flex h-7 w-9 items-center justify-center gap-0.5 rounded-md border"
                  style={{ backgroundColor: palette.garment }}
                >
                  {palette.inks.map((ink) => (
                    <span
                      className="size-1.5 rounded-full"
                      key={ink}
                      style={{ backgroundColor: ink }}
                    />
                  ))}
                </span>
                <span className="text-[0.65rem]">{colours[index]}</span>
              </span>
            ))}
          </div>
        </div>
      </section>
      <div className="flex justify-end">
        <DemoButton
          pressed={pressedAt(elapsed, REVIEW_CLICK)}
          primary
          ref={target}
        >
          {designs("make")}
        </DemoButton>
      </div>
    </motion.div>
  );
};

/** The three jobs behind "Make designs", ticking off as they finish. */
const MakeScene = ({ elapsed }: { elapsed: number }) => {
  const t = useTranslations("Home");
  const wizard = useTranslations("Wizard.working");
  const jobs = [
    t("demo.make.brief"),
    t("demo.make.draw"),
    t("demo.make.check"),
  ];
  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="flex h-full flex-col items-center justify-center gap-4"
      exit={{ opacity: 0 }}
      initial={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
    >
      <ShuttleLoader label={wizard("designs")} size={40} />
      <ul className="flex flex-col gap-2 text-sm">
        {jobs.map((job, index) => {
          const done = elapsed >= (MAKE_DONE[index] ?? 0);
          return (
            <li
              className={cn(
                "flex items-center gap-2 transition-opacity",
                done ? "opacity-100" : "opacity-45"
              )}
              key={job}
            >
              <span
                className={cn(
                  "grid size-4 place-items-center rounded-full border",
                  done
                    ? "border-success bg-success text-background"
                    : "border-border"
                )}
              >
                {done ? <Check className="size-3" /> : null}
              </span>
              {job}
            </li>
          );
        })}
      </ul>
    </motion.div>
  );
};

const DesignsScene = ({
  elapsed,
  target,
}: {
  elapsed: number;
  target: RefObject<HTMLButtonElement | null>;
}) => {
  const t = useTranslations("Home");
  const wizard = useTranslations("Wizard.designs");
  const titles = t.raw("demo.designs") as string[];
  const approved = elapsed >= DESIGN_CLICK;
  const focused = elapsed >= DESIGN_FOCUS;
  return (
    <LayoutGroup>
      <ul
        className={cn(
          "grid gap-2.5 sm:gap-3",
          focused
            ? "grid-cols-1 place-items-center"
            : "grid-cols-2 sm:grid-cols-4"
        )}
      >
        <AnimatePresence mode="popLayout">
          {DESIGNS.filter((_, index) => !focused || index === 0).map(
            ({ mockup, score }, index) => {
              const ready = score >= READY_SCORE;
              return (
                <motion.li
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  className={cn(
                    focused && "w-full max-w-56",
                    index > 1 && "max-sm:hidden"
                  )}
                  exit={{ opacity: 0, scale: 0.92 }}
                  initial={{ opacity: 0, scale: 0.96, y: 12 }}
                  key={titles[index]}
                  layout
                  transition={{
                    delay: focused ? 0 : index * 0.1,
                    duration: 0.55,
                    ease: EXPO_OUT,
                  }}
                >
                  <Card
                    className={cn(
                      "gap-0 overflow-hidden py-0",
                      index === 0 && approved && "ring-success ring-2"
                    )}
                  >
                    <div className="bg-muted relative aspect-[5/4] overflow-hidden sm:aspect-square">
                      <Image
                        alt=""
                        className="object-cover object-[50%_55%]"
                        fill
                        sizes="(min-width: 640px) 180px, 45vw"
                        src={mockup}
                      />
                      {index === 0 && approved ? (
                        <motion.span
                          animate={{ opacity: 1, scale: 1 }}
                          className="absolute end-2 top-2"
                          initial={{ opacity: 0, scale: 0.6 }}
                        >
                          <Badge>{wizard("approved")}</Badge>
                        </motion.span>
                      ) : null}
                    </div>
                    <div className="flex flex-col gap-1.5 p-2 sm:p-2.5">
                      <p className="truncate text-xs font-semibold">
                        {titles[index]}
                      </p>
                      <p
                        className={cn(
                          "figures flex items-center gap-1 text-[0.7rem] font-semibold",
                          ready ? "text-success" : "text-warning"
                        )}
                      >
                        <span
                          className={cn(
                            "size-1.5 rounded-full",
                            ready ? "bg-success" : "bg-warning"
                          )}
                        />
                        {ready ? wizard("checkReady") : wizard("checkRevise")}{" "}
                        {wizard("checkScore", { score })}
                      </p>
                      {index === 0 ? (
                        <DemoButton
                          className={cn(focused && "hidden")}
                          pressed={pressedAt(elapsed, DESIGN_CLICK)}
                          ref={target}
                        >
                          <Check data-icon="inline-start" />
                          {wizard("approve")}
                        </DemoButton>
                      ) : (
                        <DemoButton className="max-sm:hidden">
                          <Check data-icon="inline-start" />
                          {wizard("approve")}
                        </DemoButton>
                      )}
                    </div>
                  </Card>
                </motion.li>
              );
            }
          )}
        </AnimatePresence>
      </ul>
    </LayoutGroup>
  );
};

/** The product on Fourthwall with its price math, then published live. */
const PublishScene = ({
  elapsed,
  tag,
  target,
}: {
  elapsed: number;
  tag: PriceBreakdown;
  target: RefObject<HTMLButtonElement | null>;
}) => {
  const t = useTranslations("Home");
  const wizard = useTranslations("Wizard.products");
  const format = useFormatter();
  const money = (value: number) =>
    format.number(value, { currency: "USD", style: "currency" });
  const live = elapsed >= PUBLISH_CLICK + PRESS_MS;
  return (
    <div className="flex items-start justify-center gap-3 sm:gap-5">
      <motion.div
        className="flex w-[52%] shrink-0 flex-col gap-2.5 sm:w-[38%]"
        {...enter()}
      >
        <ProductListing
          className={cn(live && "ring-success ring-2")}
          image={MOCKUPS.fern}
          imageAlt=""
          price={money(tag.price)}
          status={live ? wizard("public") : wizard("hidden")}
          title={t("demo.product")}
        />
        <DemoButton
          className={cn(live && "invisible")}
          pressed={pressedAt(elapsed, PUBLISH_CLICK)}
          primary
          ref={target}
        >
          {wizard("publish")}
        </DemoButton>
      </motion.div>
      <motion.div className="w-[46%] shrink-0 pt-4 sm:w-[40%]" {...enter(0.3)}>
        <HangTag
          className="rotate-[2deg]"
          lines={[
            { label: t("tag.price"), value: money(tag.price) },
            {
              label: t("tag.blank"),
              value: `− ${money(tag.baseCost)}`,
            },
            {
              label: t("tag.fees"),
              value: `− ${money(tag.cardFees)}`,
            },
            {
              emphasis: true,
              label: t("tag.profit"),
              value: money(tag.profit),
            },
          ]}
          title={t("tag.title")}
        />
        <p className="text-muted-foreground mt-3 text-[0.7rem] leading-snug max-sm:hidden">
          {t("demo.noStock")}
        </p>
      </motion.div>
    </div>
  );
};

/** One labelled spend rule. */
const Rule = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-baseline justify-between gap-3">
    <dt className="text-muted-foreground text-[0.7rem]">{label}</dt>
    <dd className="figures text-xs font-semibold">{value}</dd>
  </div>
);

/**
 * The campaign: image and video ads for the idea's Qloo audience, built
 * paused on Meta under the seller's spend rules, waiting for their yes.
 */
const CampaignScene = ({ elapsed }: { elapsed: number }) => {
  const t = useTranslations("Home");
  const campaign = useTranslations("Wizard.campaign");
  const format = useFormatter();
  const dollars = (value: number) =>
    format.number(value, {
      currency: "USD",
      maximumFractionDigits: 0,
      style: "currency",
    });
  return (
    <div className="flex items-start justify-center gap-3 sm:gap-5">
      <motion.div
        className="relative w-[58%] max-w-56 shrink-0 sm:w-[34%]"
        {...enter()}
      >
        <AdPreview
          body={t("demo.ad.body")}
          brand={t("demo.ad.brand")}
          cta={t("demo.ad.cta")}
          headline={t("demo.product")}
          photoAlt=""
          sponsored={t("demo.ad.sponsored")}
        />
        {elapsed >= VIDEO_IN ? (
          <motion.div
            animate={{ opacity: 1, rotate: -3, y: 0 }}
            className="border-background shadow-floating absolute end-2 top-24 w-[36%] overflow-hidden rounded-lg border-2"
            initial={{ opacity: 0, rotate: 0, y: 12 }}
            transition={{ duration: 0.5, ease: EXPO_OUT }}
          >
            <div className="bg-muted relative aspect-[9/16]">
              <Image
                alt=""
                className="object-cover object-[50%_45%]"
                fill
                sizes="120px"
                src={MOCKUPS.fern}
              />
              <span className="bg-background/85 absolute inset-x-1 bottom-1 flex items-center gap-1 rounded px-1 py-0.5 text-[0.6rem] font-semibold whitespace-nowrap">
                <Play className="size-2.5 fill-current" />
                {t("demo.video")}
              </span>
            </div>
          </motion.div>
        ) : null}
      </motion.div>
      {elapsed >= RULES_IN ? (
        <motion.div
          className="flex w-[46%] min-w-0 flex-col gap-3 pt-1 max-sm:hidden"
          {...enter()}
        >
          <section className="flex flex-col gap-1">
            <h4 className="text-xs font-semibold">{campaign("audience")}</h4>
            <p className="text-muted-foreground text-[0.7rem] leading-snug">
              {t("demo.audience")}
            </p>
          </section>
          <section className="border-border flex flex-col gap-1.5 rounded-lg border p-2.5">
            <h4 className="flex items-center gap-1.5 text-xs font-semibold">
              <ShieldCheck className="text-success size-3.5" />
              {campaign("rules")}
            </h4>
            <dl className="flex flex-col gap-1">
              <Rule label={t("demo.rules.daily")} value={dollars(DAILY_CAP)} />
              <Rule
                label={t("demo.rules.monthly")}
                value={dollars(MONTHLY_CAP)}
              />
              <Rule label={t("demo.rules.loss")} value={dollars(LOSS_LIMIT)} />
            </dl>
            <p className="text-muted-foreground text-[0.65rem] leading-snug">
              {t("demo.rules.meta")}
            </p>
          </section>
          {elapsed >= PAUSED_IN ? (
            <motion.div
              animate={{ opacity: 1, scale: 1, y: 0 }}
              initial={{ opacity: 0, scale: 0.7, y: 8 }}
              transition={{ bounce: 0.4, duration: 0.5, type: "spring" }}
            >
              <PausedBadge>{t("demo.paused")}</PausedBadge>
            </motion.div>
          ) : null}
        </motion.div>
      ) : null}
      {elapsed >= PAUSED_IN ? (
        <motion.div
          animate={{ opacity: 1, scale: 1, y: 0 }}
          className="absolute start-1/2 bottom-3 z-10 -translate-x-1/2 sm:hidden rtl:translate-x-1/2"
          initial={{ opacity: 0, scale: 0.7, y: 8 }}
          transition={{ bounce: 0.4, duration: 0.5, type: "spring" }}
        >
          <PausedBadge>{t("demo.paused")}</PausedBadge>
        </motion.div>
      ) : null}
    </div>
  );
};

const WorkScene = ({ work }: { work: Exclude<Work, "designs"> }) => {
  const wizard = useTranslations("Wizard.working");
  const label = work === "products" ? wizard("products") : wizard("campaign");
  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="flex h-full flex-col items-center justify-center gap-3"
      exit={{ opacity: 0 }}
      initial={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
    >
      <ShuttleLoader label={label} size={44} />
      <p className="text-muted-foreground max-w-[32ch] text-center text-sm">
        {label}
      </p>
    </motion.div>
  );
};

/** When the cursor shows up and clicks, for the scenes it acts in. */
const CURSOR_BEATS: Partial<Record<Scene, { show: number; click: number }>> = {
  designs: { click: DESIGN_CLICK, show: DESIGN_CURSOR },
  home: { click: IDEA_CLICK, show: IDEA_CURSOR },
  publish: { click: PUBLISH_CLICK, show: PUBLISH_CURSOR },
  review: { click: REVIEW_CLICK, show: REVIEW_CURSOR },
};

const cursorPhase = (beat: Beat, elapsed: number) => {
  const beats = beat.kind === "scene" ? CURSOR_BEATS[beat.scene] : undefined;
  if (!beats || elapsed < beats.show || elapsed >= beats.click + PRESS_MS * 2) {
    return "hidden";
  }
  return pressedAt(elapsed, beats.click) ? "pressed" : "moving";
};

const SceneView = ({
  beat,
  elapsed,
  tag,
  target,
}: {
  beat: Beat;
  elapsed: number;
  tag: PriceBreakdown;
  target: RefObject<HTMLButtonElement | null>;
}) => {
  if (beat.kind === "work") {
    return beat.work === "designs" ? (
      <MakeScene elapsed={elapsed} />
    ) : (
      <WorkScene work={beat.work} />
    );
  }
  switch (beat.scene) {
    case "home": {
      return <HomeScene elapsed={elapsed} target={target} />;
    }
    case "review": {
      return <ReviewScene elapsed={elapsed} target={target} />;
    }
    case "designs": {
      return <DesignsScene elapsed={elapsed} target={target} />;
    }
    case "publish": {
      return <PublishScene elapsed={elapsed} tag={tag} target={target} />;
    }
    default: {
      return <CampaignScene elapsed={elapsed} />;
    }
  }
};

/** Hover and focus inside the figure, read from the DOM's own events. */
const useHoverFocus = (ref: RefObject<HTMLElement | null>) => {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node) {
      return;
    }
    const pointIn = () => setHovered(true);
    const pointOut = () => setHovered(false);
    const focusIn = () => setFocused(true);
    const focusOut = () => setFocused(false);
    node.addEventListener("pointerenter", pointIn);
    node.addEventListener("pointerleave", pointOut);
    node.addEventListener("focusin", focusIn);
    node.addEventListener("focusout", focusOut);
    return () => {
      node.removeEventListener("pointerenter", pointIn);
      node.removeEventListener("pointerleave", pointOut);
      node.removeEventListener("focusin", focusIn);
      node.removeEventListener("focusout", focusOut);
    };
  }, [ref]);
  return { focused, hovered };
};

/** The dashboard's rail, with Home or Drops active. */
const DemoRail = ({ atHome }: { atHome: boolean }) => {
  const shell = useTranslations("Shell.nav");
  return (
    <div className="bg-sidebar text-sidebar-foreground hidden w-14 shrink-0 flex-col gap-6 px-2 py-4 sm:flex lg:w-44 lg:px-3">
      <div className="flex h-7 items-center justify-center lg:justify-start lg:px-1.5">
        <span className="lg:hidden">
          <ShuttleMark label={null} size={26} />
        </span>
        <span className="hidden lg:inline-flex">
          <Logo height={20} tone="dark" />
        </span>
      </div>
      <ul className="flex flex-col gap-0.5 text-[0.8rem]">
        {NAV.map(({ icon: Icon, key: item }) => {
          const active = item === (atHome ? "home" : "drops");
          return (
            <li
              className={cn(
                "flex h-9 items-center justify-center gap-2.5 rounded-md lg:justify-start lg:px-2.5",
                active ? "bg-sidebar-accent font-medium" : "opacity-70"
              )}
              key={item}
            >
              <Icon
                className={cn(
                  "size-4 shrink-0",
                  active && "text-sidebar-primary"
                )}
              />
              <span className="hidden truncate lg:inline">{shell(item)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

/** The top bar: the crumb to the page on show, the theme and the avatar. */
const DemoTopBar = ({ stage }: { stage: Stage | undefined }) => {
  const t = useTranslations("Home");
  const shell = useTranslations("Shell.nav");
  const stages = useTranslations("Stages");
  return (
    <div className="border-border bg-background/90 flex h-11 shrink-0 items-center gap-2.5 border-b px-4 text-xs sm:px-6">
      <PanelLeft className="text-muted-foreground size-4 max-sm:hidden" />
      <span className="bg-border h-4 w-px max-sm:hidden" />
      <span className="sm:hidden">
        <ShuttleMark label={null} size={20} />
      </span>
      {stage === undefined ? (
        <span className="font-medium">{shell("home")}</span>
      ) : (
        <>
          <span className="text-muted-foreground">{shell("drops")}</span>
          <ChevronRight className="text-muted-foreground size-3.5 rtl:rotate-180" />
          <span className="truncate font-medium">{stages(stage)}</span>
        </>
      )}
      <span className="ms-auto flex items-center gap-2">
        <span className="border-border grid size-7 place-items-center rounded-md border">
          <Sun className="size-3.5" />
        </span>
        <span className="bg-secondary text-secondary-foreground grid size-7 place-items-center rounded-full text-[0.65rem] font-semibold">
          {t("demo.initials")}
        </span>
      </span>
    </div>
  );
};

/**
 * The hero's centrepiece: one example run through the app as it works
 * today, on a loop. An idea picked on Home, its tone and colours, the
 * designs drawn and checked, the product published to Fourthwall and the
 * campaign built paused. It plays only while on screen, pauses on hover,
 * focus or the visitor's toggle, and shows the finished frame, still, to
 * visitors who ask for reduced motion. The picture is hidden from assistive
 * tech; the caption carries the same story in words.
 *
 * `tag` is a typical tee's price, worked out on the server from the pricing
 * rules (src/lib/pricing.ts).
 */
export const HeroDemo = ({
  className,
  tag,
}: {
  className?: string;
  tag: PriceBreakdown;
}) => {
  const t = useTranslations("Home");
  const wizard = useTranslations("Wizard");
  const reduced = useReducedMotion() ?? false;
  const root = useRef<HTMLElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const target = useRef<HTMLButtonElement>(null);
  const inView = useInView(frame, { amount: 0.35 });
  const { hovered, focused } = useHoverFocus(root);
  const [choice, setChoice] = useState<"play" | "pause" | null>(null);
  const [clock, tick] = useReducer(advance, { elapsed: 0, index: 0 });

  const wants = choice ?? (focused ? "pause" : "play");
  const playing = !reduced && inView && !hovered && wants === "play";

  useEffect(() => {
    if (!playing) {
      return;
    }
    const timer = setInterval(tick, TICK);
    return () => clearInterval(timer);
  }, [playing]);

  const beat = reduced ? FINAL : (SEQUENCE[clock.index] ?? FINAL);
  const elapsed = reduced ? FINAL_ELAPSED : clock.elapsed;
  const key = beat.kind === "scene" ? beat.scene : beat.work;
  const atHome = key === "home";
  const stage = key === "home" ? undefined : STAGE_OF[key];
  const finished = key === "campaign" && elapsed >= PAUSED_IN;
  const title =
    key === "home" ? wizard("directions.title") : wizard(TITLE_OF[key]);

  return (
    <figure className={cn("relative", className)} ref={root}>
      <figcaption className="sr-only">{t("demo.alt")}</figcaption>
      {/* Soft light behind the app, so it sits on the page like a lit screen. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-x-8 -top-12 -bottom-8 -z-10 bg-[radial-gradient(55%_60%_at_45%_35%,color-mix(in_oklab,var(--primary)_16%,transparent),transparent_72%)] blur-2xl"
      />
      <div
        aria-hidden="true"
        className="border-border bg-background shadow-floating relative aspect-[4/5] overflow-hidden rounded-2xl border ring-1 ring-black/5 select-none sm:aspect-[4/3] lg:aspect-[16/11] lg:rounded-e-none lg:border-e-0 dark:ring-white/5"
        inert
        ref={frame}
      >
        <div className="flex h-full">
          <DemoRail atHome={atHome} />
          <div className="flex min-w-0 flex-1 flex-col">
            <DemoTopBar stage={stage} />
            <div className="flex min-h-0 flex-1 flex-col gap-3 p-4 sm:gap-4 sm:p-6">
              <div className="flex items-baseline justify-between gap-2">
                <p className="font-display truncate text-lg font-semibold tracking-[-0.02em] sm:text-xl">
                  {title}
                </p>
                {stage === undefined ? null : (
                  <p className="text-muted-foreground figures shrink-0 text-xs">
                    {wizard("stepOf", {
                      current: STAGES.indexOf(stage) + 1,
                      total: STAGE_COUNT,
                    })}
                  </p>
                )}
              </div>
              {stage === undefined ? null : (
                <RunTape finished={finished} stage={stage} />
              )}
              <div className="relative min-h-0 flex-1 pt-1">
                <AnimatePresence initial={false} mode="wait">
                  <motion.div
                    animate={{ opacity: 1 }}
                    className="flex h-full flex-col justify-center-safe"
                    exit={{ opacity: 0, transition: { duration: 0.2 } }}
                    initial={{ opacity: 0 }}
                    key={`${clock.index}-${key}`}
                  >
                    <SceneView
                      beat={beat}
                      elapsed={elapsed}
                      tag={tag}
                      target={target}
                    />
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>
        {/* Top light on the glass. */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-white/15 to-transparent dark:from-white/[0.04]" />
        {reduced ? null : (
          <Cursor
            frame={frame}
            phase={cursorPhase(beat, elapsed)}
            target={target}
          />
        )}
      </div>
      {reduced ? null : (
        <Button
          aria-label={wants === "play" ? t("demo.pause") : t("demo.play")}
          className="bg-background/85 absolute start-3 bottom-3 z-30 backdrop-blur sm:start-[4.25rem] lg:start-[11.75rem]"
          onClick={() => setChoice(wants === "play" ? "pause" : "play")}
          size="icon-sm"
          variant="outline"
        >
          {wants === "play" ? (
            <Pause aria-hidden="true" />
          ) : (
            <Play aria-hidden="true" />
          )}
        </Button>
      )}
    </figure>
  );
};
