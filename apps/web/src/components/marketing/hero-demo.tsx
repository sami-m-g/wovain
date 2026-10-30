"use client";

import type { IdeaCard } from "@wovain/core/idea-card";
import { Badge } from "@wovain/ui/components/badge";
import { Button } from "@wovain/ui/components/button";
import { Card } from "@wovain/ui/components/card";
import { Checkbox } from "@wovain/ui/components/checkbox";
import { cn } from "@wovain/ui/lib/utils";
import {
  Check,
  ChevronRight,
  House,
  Layers,
  PanelLeft,
  Settings,
  Sun,
  MousePointer2,
  Pause,
  Play,
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
import { RunTape, STAGE_COUNT } from "@/components/product/run-tape";
import type { Stage } from "@/components/product/run-tape";
import type { PriceBreakdown } from "@/lib/pricing";

/** The clock the whole sequence runs on, in milliseconds. */
const TICK = 50;
const EXPO_OUT = [0.16, 1, 0.3, 1] as const;

// Beats inside each scene, in milliseconds from the scene's start.
const TYPE_START = 350;
const TYPE_PER_CHAR = 26;
const BRIEF_CURSOR = 3000;
const BRIEF_CLICK = 3800;
const IDEA_PICK = 6200;
const IDEA_SCROLL_START = 700;
const IDEA_SCROLL_MS = 5000;
/** Ideas the evidence gate left out of the example, for the count above the card. */
const IDEAS_LEFT_OUT = 4;
const DESIGN_CURSOR = 1500;
const DESIGN_CLICK = 2400;
const DESIGN_FOCUS = 3000;
const TAG_OUT = 2800;
const AD_IN = 3800;
const PAUSED_IN = 5200;
const PRESS_MS = 220;
/** Where the cursor enters, as a share of the frame, and how it moves. */
const CURSOR_ENTRY = { x: 0.88, y: 0.96 } as const;
const CURSOR_GLIDE = 0.75;
const CURSOR_PRESS = 0.82;

type Scene = "brief" | "trends" | "designs" | "launch";
type Work = "research" | "designs" | "products";

type Beat =
  | { kind: "scene"; scene: Scene; ms: number }
  | { kind: "work"; work: Work; ms: number };

/** The choreography: one drop, brief to paused campaign, about 26 seconds. */
const SEQUENCE: readonly Beat[] = [
  { kind: "scene", ms: 4500, scene: "brief" },
  { kind: "work", ms: 1100, work: "research" },
  { kind: "scene", ms: 7500, scene: "trends" },
  { kind: "work", ms: 1100, work: "designs" },
  { kind: "scene", ms: 4300, scene: "designs" },
  { kind: "work", ms: 1100, work: "products" },
  { kind: "scene", ms: 8000, scene: "launch" },
];

const FINAL: Beat = { kind: "scene", ms: 0, scene: "launch" };
const FINAL_ELAPSED = 99_999;

const STAGE_OF: Record<Scene | Work, Stage> = {
  brief: "brief",
  designs: "designs",
  launch: "products",
  products: "products",
  research: "trends",
  trends: "trends",
};

const STAGE_ORDER: readonly Stage[] = [
  "brief",
  "trends",
  "designs",
  "products",
  "campaign",
];

const TITLE_OF = {
  brief: "brief.title",
  campaign: "campaign.title",
  designs: "designs.title",
  products: "products.title",
  trends: "trends.title",
} as const satisfies Record<Stage, string>;

/** The dashboard's own rail, in its order; a new drop is a page of "drops". */
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

const BriefScene = ({
  elapsed,
  target,
}: {
  elapsed: number;
  target: RefObject<HTMLButtonElement | null>;
}) => {
  const t = useTranslations("Home");
  const wizard = useTranslations("Wizard.brief");
  const brief = t("demo.brief");
  const typed = Math.max(
    0,
    Math.min(brief.length, Math.floor((elapsed - TYPE_START) / TYPE_PER_CHAR))
  );
  const done = typed === brief.length;
  return (
    <motion.div className="flex flex-col gap-4" {...enter()}>
      <Card className="gap-3 p-4 sm:p-5">
        <p className="text-sm font-medium">{wizard("label")}</p>
        <div className="border-input bg-background min-h-24 rounded-lg border p-3 text-sm leading-relaxed sm:min-h-28 sm:text-base">
          {brief.slice(0, typed)}
          <span
            className={cn(
              "bg-primary ms-px inline-block h-[1.1em] w-0.5 translate-y-[0.15em]",
              done && "animate-pulse"
            )}
          />
        </div>
        <p className="text-muted-foreground text-xs">{wizard("hint")}</p>
      </Card>
      <div className="flex justify-end">
        <DemoButton
          pressed={elapsed >= BRIEF_CLICK && elapsed < BRIEF_CLICK + PRESS_MS}
          primary
          ref={target}
        >
          {wizard("submit")}
        </DemoButton>
      </div>
    </motion.div>
  );
};

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
    citations: copy.sources.map((title) => ({
      title,
      url: "https://example.com/",
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
 * The idea step: the app's one idea card, read top to bottom as it scrolls,
 * under the count of ideas the evidence gate left out. Then the designer
 * picks it.
 */
const TrendsScene = ({ elapsed }: { elapsed: number }) => {
  const t = useTranslations("Home");
  const card = useTranslations("IdeaCard");
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
  const picked = elapsed >= IDEA_PICK;
  return (
    <motion.div className="flex h-full flex-col gap-2" {...enter()}>
      <p className="text-muted-foreground text-xs">
        {card("droppedCount", { count: IDEAS_LEFT_OUT })}
      </p>
      <div className="min-h-0 flex-1 overflow-hidden" ref={box}>
        <div
          className="transition-transform duration-100 ease-linear"
          ref={inner}
          style={{ transform: `translateY(${-overflow * read}px)` }}
        >
          <Card className={cn("p-4", picked && "ring-primary ring-2")}>
            <IdeaCardView
              card={exampleCard(t.raw("demo.idea") as IdeaCopy)}
              lead={
                <Checkbox checked={picked} className="mt-0.5" tabIndex={-1} />
              }
            />
          </Card>
        </div>
      </div>
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
                          pressed={
                            elapsed >= DESIGN_CLICK &&
                            elapsed < DESIGN_CLICK + PRESS_MS
                          }
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

const LaunchScene = ({
  elapsed,
  tag,
}: {
  elapsed: number;
  tag: PriceBreakdown;
}) => {
  const t = useTranslations("Home");
  const home = useTranslations("Home");
  const wizard = useTranslations("Wizard");
  const format = useFormatter();
  const money = (value: number) =>
    format.number(value, { currency: "USD", style: "currency" });
  const withTag = elapsed < TAG_OUT;
  const withAd = elapsed >= AD_IN;
  const working = !withTag && !withAd;
  return (
    <LayoutGroup>
      <div className="relative flex items-start justify-center gap-3 sm:gap-5">
        <motion.div
          className={cn(
            "w-[46%] shrink-0 sm:w-[38%]",
            withAd && "max-sm:hidden sm:w-[34%]"
          )}
          layout
          {...enter()}
        >
          <ProductListing
            image={MOCKUPS.fern}
            imageAlt=""
            detail={
              <p className="text-muted-foreground figures text-[0.7rem]">
                {home("tag.profit")}{" "}
                <span className="text-foreground font-semibold">
                  {money(tag.profit)}
                </span>
              </p>
            }
            price={money(tag.price)}
            status={wizard("products.hidden")}
            title={t("demo.product")}
          />
        </motion.div>
        <AnimatePresence mode="popLayout">
          {withTag ? (
            <motion.div
              className="w-[50%] shrink-0 pt-6 sm:w-[40%]"
              exit={{ opacity: 0, x: 24 }}
              key="tag"
              layout
              {...enter(0.3)}
            >
              <HangTag
                className="rotate-[2deg]"
                lines={[
                  { label: home("tag.price"), value: money(tag.price) },
                  {
                    label: home("tag.blank"),
                    value: `− ${money(tag.baseCost)}`,
                  },
                  {
                    label: home("tag.fees"),
                    value: `− ${money(tag.cardFees)}`,
                  },
                  {
                    emphasis: true,
                    label: home("tag.profit"),
                    value: money(tag.profit),
                  },
                ]}
                title={home("tag.title")}
              />
            </motion.div>
          ) : null}
          {working ? (
            <motion.div
              animate={{ opacity: 1 }}
              className="flex w-[40%] flex-col items-center justify-center gap-3 self-center"
              exit={{ opacity: 0 }}
              initial={{ opacity: 0 }}
              key="working"
            >
              <ShuttleLoader label={wizard("working.campaign")} size={36} />
              <p className="text-muted-foreground text-center text-xs">
                {wizard("working.campaign")}
              </p>
            </motion.div>
          ) : null}
          {withAd ? (
            <motion.div
              className="relative w-[78%] max-w-64 shrink-0 sm:w-[42%]"
              key="ad"
              layout
              {...enter()}
            >
              <AdPreview
                photoAlt=""
                body={t("demo.ad.body")}
                brand={t("demo.ad.brand")}
                cta={t("demo.ad.cta")}
                headline={t("demo.product")}
                sponsored={t("demo.ad.sponsored")}
              />
              {elapsed >= PAUSED_IN ? (
                <motion.div
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  className="absolute start-1/2 -bottom-3 -translate-x-1/2 rtl:translate-x-1/2"
                  initial={{ opacity: 0, scale: 0.7, y: 8 }}
                  transition={{ bounce: 0.4, duration: 0.5, type: "spring" }}
                >
                  <PausedBadge>{t("demo.paused")}</PausedBadge>
                </motion.div>
              ) : null}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </LayoutGroup>
  );
};

const WorkScene = ({ work }: { work: Work }) => {
  const wizard = useTranslations("Wizard.working");
  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="flex h-full flex-col items-center justify-center gap-3"
      exit={{ opacity: 0 }}
      initial={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
    >
      <ShuttleLoader label={wizard(work)} size={44} />
      <p className="text-muted-foreground max-w-[28ch] text-center text-sm">
        {wizard(work)}
      </p>
    </motion.div>
  );
};

/** When the cursor shows up and clicks, for the scenes it acts in. */
const CURSOR_BEATS: Partial<Record<Scene, { show: number; click: number }>> = {
  brief: { click: BRIEF_CLICK, show: BRIEF_CURSOR },
  designs: { click: DESIGN_CLICK, show: DESIGN_CURSOR },
};

const cursorPhase = (beat: Beat, elapsed: number) => {
  const beats = beat.kind === "scene" ? CURSOR_BEATS[beat.scene] : undefined;
  if (!beats || elapsed < beats.show || elapsed >= beats.click + PRESS_MS * 2) {
    return "hidden";
  }
  const pressing = elapsed >= beats.click && elapsed < beats.click + PRESS_MS;
  return pressing ? "pressed" : "moving";
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
    return <WorkScene work={beat.work} />;
  }
  if (beat.scene === "brief") {
    return <BriefScene elapsed={elapsed} target={target} />;
  }
  if (beat.scene === "trends") {
    return <TrendsScene elapsed={elapsed} />;
  }
  if (beat.scene === "designs") {
    return <DesignsScene elapsed={elapsed} target={target} />;
  }
  return <LaunchScene elapsed={elapsed} tag={tag} />;
};

/** The tape's passage and whether the run is done, at this point of the loop. */
const tapeOf = (beat: Beat, elapsed: number) => {
  const launched = beat.kind === "scene" && beat.scene === "launch";
  const key = beat.kind === "scene" ? beat.scene : beat.work;
  return {
    finished: launched && elapsed >= PAUSED_IN,
    stage: launched && elapsed >= AD_IN ? "campaign" : STAGE_OF[key],
  } as const;
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

/**
 * The hero's centrepiece: one example drop played in the app's own UI, from
 * the brief being typed to a paused campaign, on a loop. It plays only while
 * on screen, pauses on hover, focus or the visitor's toggle, and shows the
 * finished frame, still, to visitors who ask for reduced motion. The picture
 * is hidden from assistive tech; the caption carries the same story in words.
 */
/**
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
  const shell = useTranslations("Shell.nav");
  const stages = useTranslations("Stages");
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
  const { stage: tapeStage, finished } = tapeOf(beat, elapsed);

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
              {NAV.map(({ icon: Icon, key: item }) => (
                <li
                  className={cn(
                    "flex h-9 items-center justify-center gap-2.5 rounded-md lg:justify-start lg:px-2.5",
                    item === "drops"
                      ? "bg-sidebar-accent font-medium"
                      : "opacity-70"
                  )}
                  key={item}
                >
                  <Icon
                    className={cn(
                      "size-4 shrink-0",
                      item === "drops" && "text-sidebar-primary"
                    )}
                  />
                  <span className="hidden truncate lg:inline">
                    {shell(item)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="border-border bg-background/90 flex h-11 shrink-0 items-center gap-2.5 border-b px-4 text-xs sm:px-6">
              <PanelLeft className="text-muted-foreground size-4 max-sm:hidden" />
              <span className="bg-border h-4 w-px max-sm:hidden" />
              <span className="sm:hidden">
                <ShuttleMark label={null} size={20} />
              </span>
              <span className="text-muted-foreground">{shell("drops")}</span>
              <ChevronRight className="text-muted-foreground size-3.5 rtl:rotate-180" />
              <span className="truncate font-medium">{stages(tapeStage)}</span>
              <span className="ms-auto flex items-center gap-2">
                <span className="border-border grid size-7 place-items-center rounded-md border">
                  <Sun className="size-3.5" />
                </span>
                <span className="bg-secondary text-secondary-foreground grid size-7 place-items-center rounded-full text-[0.65rem] font-semibold">
                  {t("demo.initials")}
                </span>
              </span>
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-3 p-4 sm:gap-4 sm:p-6">
              <div className="flex items-baseline justify-between gap-2">
                <p className="font-display truncate text-lg font-semibold tracking-[-0.02em] sm:text-xl">
                  {wizard(TITLE_OF[tapeStage])}
                </p>
                <p className="text-muted-foreground figures shrink-0 text-xs">
                  {wizard("stepOf", {
                    current: STAGE_ORDER.indexOf(tapeStage) + 1,
                    total: STAGE_COUNT,
                  })}
                </p>
              </div>
              <RunTape finished={finished} stage={tapeStage} />
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
