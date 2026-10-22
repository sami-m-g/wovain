import { Button } from "@openai/apps-sdk-ui/components/Button";
import {
  ArrowUp,
  ChevronLeft,
  Expand,
  Play,
} from "@openai/apps-sdk-ui/components/Icon";
import { Input } from "@openai/apps-sdk-ui/components/Input";
import type { Ad, AdSlot, AdVideo } from "@wovain/shared/ad";
import { money } from "@wovain/shared/economics";
import { useId, useRef, useState } from "react";

import { useAction } from "../lib/use-action.ts";
import { ActionError } from "../lib/widget-shell.tsx";

export interface AdWidgetActions {
  // Records the choice, then posts a message so the campaign step can start
  // after the last ad widget.
  onAdd: (ad: Ad) => Promise<Ad>;
  onFeedback: (ad: Ad, feedback: string) => Promise<void>;
  // Asks the host for full screen (or back to inline); returns the mode it got.
  onFullscreen: (on: boolean) => Promise<void>;
  onRetry: (ad: Ad, slot: AdSlot) => Promise<void>;
  onSkip: (ad: Ad) => Promise<Ad>;
}

export interface AdWidgetViewProps extends AdWidgetActions {
  ad: Ad;
}

const times = (value: number) => `${value.toFixed(1)}×`;

const VideoTile = ({
  onExpand,
  onRetry,
  video,
}: {
  onExpand: () => void;
  onRetry: () => void;
  video: AdVideo;
}) => {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  if (video.status === "failed" || video.url === undefined) {
    return (
      <div className="border-subtle bg-surface-secondary flex aspect-[9/16] w-full flex-col items-center justify-center gap-2 rounded-xl border p-2 text-center">
        <p className="text-secondary text-xs">
          {`Video ${video.slot} didn't render.`}
        </p>
        <Button color="secondary" onClick={onRetry} size="sm" variant="soft">
          Retry
        </Button>
      </div>
    );
  }

  const toggle = () => {
    const element = ref.current;
    if (element === null) {
      return;
    }
    if (element.paused) {
      // A tap is a user gesture, so the clip can play with its audio.
      element.muted = false;
      void element.play();
      setPlaying(true);
    } else {
      element.pause();
      setPlaying(false);
    }
  };

  return (
    <div className="border-subtle relative aspect-[9/16] w-full overflow-hidden rounded-xl border bg-black">
      {/* Ads autoplay muted on Meta, so the preview plays muted too. */}
      <video
        aria-label={`Video ${video.slot}, ${video.angle}`}
        className="size-full object-cover"
        loop
        muted
        onEnded={() => {
          setPlaying(false);
        }}
        playsInline
        preload="metadata"
        ref={ref}
        src={video.url}
      />
      <button
        aria-label={`${playing ? "Pause" : "Play"} video ${video.slot}`}
        className="absolute inset-0 flex items-center justify-center"
        onClick={toggle}
        type="button"
      >
        {playing ? null : (
          <span className="rounded-full bg-black/55 p-2 text-white">
            <Play aria-hidden className="size-5" />
          </span>
        )}
      </button>
      <button
        aria-label={`Watch video ${video.slot} full screen`}
        className="absolute top-1.5 right-1.5 rounded-md bg-black/55 p-1 text-white"
        onClick={onExpand}
        type="button"
      >
        <Expand aria-hidden className="size-4" />
      </button>
    </div>
  );
};

const Economics = ({ ad }: { ad: Ad }) => {
  const { economics: e, rules } = ad;
  return (
    <div className="border-subtle mt-4 grid gap-1 border-t pt-4 text-sm">
      <p className="text-secondary m-0">
        {`${money(e.price)} − ${money(e.baseCost)} base − ${money(e.cardFees)} fees − ${money(e.refundReserve)} reserve = `}
        <span className="text-default font-semibold">
          {money(e.breakevenPerSale)}
        </span>
      </p>
      <p className="m-0">
        {`Breakeven: ${money(e.breakevenPerSale)} per sale · ${times(e.roas)} return on ad spend`}
        <span className="text-secondary">{` (${times(e.roasOnOrderValue)} on order value)`}</span>
      </p>
      <p className="text-secondary m-0">
        {`Rules: off at ${money(rules.killNoSalesAt)} with no sales · budget +${rules.scaleStepPct}% under ${money(rules.scaleUnder)}`}
      </p>
    </div>
  );
};

type Busy = "add" | "skip" | "feedback" | null;

export const AdWidgetView = ({
  ad: initialAd,
  onAdd,
  onFeedback,
  onFullscreen,
  onRetry,
  onSkip,
}: AdWidgetViewProps) => {
  const titleId = useId();
  const feedbackId = useId();
  const [ad, setAd] = useState(initialAd);
  const { busy, failed, run } = useAction<NonNullable<Busy>>();
  const [feedback, setFeedback] = useState("");
  const [focused, setFocused] = useState<AdVideo | null>(null);
  const done = ad.status !== "draft";

  const expand = async (video: AdVideo) => {
    setFocused(video);
    await onFullscreen(true);
  };

  const close = async () => {
    setFocused(null);
    await onFullscreen(false);
  };

  if (focused?.url !== undefined) {
    return (
      <section
        aria-label={`Video ${focused.slot} full screen`}
        className="flex h-full flex-col gap-2 p-3"
      >
        <button
          className="text-secondary flex items-center gap-1 self-start text-sm"
          onClick={() => {
            void close();
          }}
          type="button"
        >
          <ChevronLeft aria-hidden className="size-4" />
          Back to the widget
        </button>
        <p className="text-secondary m-0 text-xs">
          Check that the print matches your design before adding the ad.
        </p>
        <video
          aria-label={`Video ${focused.slot}, ${focused.angle}`}
          autoPlay
          className="mx-auto aspect-[9/16] max-h-[80vh] rounded-xl bg-black"
          controls
          loop
          muted
          playsInline
          src={focused.url}
        />
      </section>
    );
  }

  return (
    <article aria-labelledby={titleId} className="p-4">
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h2 className="heading-sm" id={titleId}>
          {`Ads · ${ad.productTitle}`}
        </h2>
        {done ? (
          <span className="bg-surface-secondary text-secondary ml-auto rounded-full px-2 py-0.5 text-xs">
            {ad.status === "added" ? "Added to campaign" : "Skipped"}
          </span>
        ) : null}
      </header>
      <p className="text-secondary mt-1 text-sm">{ad.coach}</p>

      <div className="mt-4 grid gap-3">
        {/* Phone-shaped tiles that fill the widget width, big enough to judge the print. */}
        <div className="grid grid-cols-3 gap-2">
          {ad.videos.map((video) => (
            <VideoTile
              key={video.slot}
              onExpand={() => {
                void expand(video);
              }}
              onRetry={() => {
                void run(null, async () => {
                  await onRetry(ad, video.slot);
                });
              }}
              video={video}
            />
          ))}
          <img
            alt={ad.staticImage.alt}
            className="border-subtle bg-surface-secondary aspect-[9/16] w-full rounded-xl border object-cover"
            height={320}
            src={ad.staticImage.url}
            width={180}
          />
        </div>
        <ul className="text-secondary m-0 grid min-w-40 flex-1 list-none content-start gap-1 p-0 text-xs">
          {ad.videos.map((video) => (
            <li key={video.slot}>
              {`${video.slot} · ${Math.round(video.seconds)}s · 9:16 · ${video.angle}`}
            </li>
          ))}
          <li>Static · Fourthwall mockup</li>
        </ul>
      </div>

      <div className="mt-4 grid gap-1.5 text-sm">
        <p className="m-0">
          <span className="text-secondary">Headline </span>
          {ad.headline}
        </p>
        <p className="m-0">
          <span className="text-secondary">Primary text </span>
          {ad.primaryText}
        </p>
      </div>

      <Economics ad={ad} />

      {done ? null : (
        <div className="border-subtle mt-4 flex flex-wrap items-center gap-2 border-t pt-4">
          <Button
            className="wovain-accent"
            color="primary"
            disabled={busy !== null}
            loading={busy === "add"}
            onClick={() => {
              void run("add", async () => {
                setAd(await onAdd(ad));
              });
            }}
          >
            Add to campaign
          </Button>
          <Button
            color="secondary"
            disabled={busy !== null}
            loading={busy === "skip"}
            onClick={() => {
              void run("skip", async () => {
                setAd(await onSkip(ad));
              });
            }}
            variant="soft"
          >
            Skip
          </Button>
          <form
            className="min-w-48 flex-1"
            onSubmit={(event) => {
              event.preventDefault();
              const text = feedback.trim();
              if (text !== "") {
                void run("feedback", async () => {
                  await onFeedback(ad, text);
                  setFeedback("");
                });
              }
            }}
          >
            <label className="sr-only" htmlFor={feedbackId}>
              Feedback on these ads
            </label>
            <Input
              disabled={busy !== null}
              endAdornment={
                <button
                  aria-label="Send feedback"
                  className="text-secondary hover:text-default disabled:opacity-40"
                  disabled={feedback.trim() === "" || busy !== null}
                  type="submit"
                >
                  <ArrowUp aria-hidden className="size-4" />
                </button>
              }
              id={feedbackId}
              onChange={(event) => {
                setFeedback(event.target.value);
              }}
              placeholder="Feedback: what should change?"
              value={feedback}
            />
          </form>
        </div>
      )}
      <ActionError failed={failed} />
    </article>
  );
};
