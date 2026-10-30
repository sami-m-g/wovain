"use client";

import { Skeleton } from "@wovain/ui/components/skeleton";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@wovain/ui/components/toggle-group";
import { cn } from "@wovain/ui/lib/utils";
import { useTranslations } from "next-intl";
import Image from "next/image";
import type { ReactNode, SyntheticEvent } from "react";
import { useState } from "react";

import { useHere } from "@/components/app/connect-state";
import { connectUrl } from "@/lib/flow-client";

const FRAME_SIZE = 640;
const SIZES = "(min-width: 1024px) 30vw, (min-width: 640px) 45vw, 100vw";

type View = "shirt" | "flat";

// fal's art is served through Next's image optimizer (next.config.ts
// remotePatterns); Fourthwall's mockups come from hosts it doesn't list.
const FAL_ART_HOST = /\.fal\.media$/u;
const optimizable = (src: string) =>
  FAL_ART_HOST.test(URL.parse(src)?.hostname ?? "");

const NO_MOCKUPS: string[] = [];

type MockupStatus = "ready" | "failed" | "not_connected" | null;

// Transparent art is judged by its visible pixels' mean relative luminance
// (sRGB weights), read from a small copy: light art gets a dark backdrop and
// dark art a light one, so either stands out from the frame.
type Tone = "light" | "dark" | "mid";
const SAMPLE_PX = 32;
const LIGHT_ART = 0.55;
const DARK_ART = 0.35;
const CHANNEL_MAX = 255;
const RED = 0.2126;
const GREEN = 0.7152;
const BLUE = 0.0722;

const toneOf = (img: HTMLImageElement): Tone => {
  const canvas = document.createElement("canvas");
  canvas.width = SAMPLE_PX;
  canvas.height = SAMPLE_PX;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (context === null) {
    return "mid";
  }
  context.drawImage(img, 0, 0, SAMPLE_PX, SAMPLE_PX);
  const { data } = context.getImageData(0, 0, SAMPLE_PX, SAMPLE_PX);
  let lit = 0;
  let seen = 0;
  for (let index = 0; index < data.length; index += 4) {
    const alpha = (data[index + 3] ?? 0) / CHANNEL_MAX;
    const luminance =
      (RED * (data[index] ?? 0) +
        GREEN * (data[index + 1] ?? 0) +
        BLUE * (data[index + 2] ?? 0)) /
      CHANNEL_MAX;
    lit += alpha * luminance;
    seen += alpha;
  }
  const mean = seen === 0 ? undefined : lit / seen;
  if (mean !== undefined && mean > LIGHT_ART) {
    return "light";
  }
  if (mean !== undefined && mean < DARK_ART) {
    return "dark";
  }
  return "mid";
};

// The frame sits on bg-muted: light in the light theme, dark in the dark one.
const BACKDROP: Record<Tone, string> = {
  dark: "dark:bg-foreground",
  light: "bg-foreground dark:bg-transparent",
  mid: "",
};

// The image stays invisible until it has loaded; the skeleton holds the space.
// `measure` reads the art's tone once loaded; only same-origin images can be
// read, which is what Next's image optimizer serves.
const useLoaded = (measure: boolean) => {
  const [loaded, setLoaded] = useState(false);
  const [tone, setTone] = useState<Tone>("mid");
  const done = (img: HTMLImageElement) => {
    setLoaded(true);
    if (measure) {
      setTone(toneOf(img));
    }
  };
  const ref = (img: HTMLImageElement | null) => {
    // A cached image can finish loading before React attaches onLoad.
    if (img?.complete && img.naturalWidth > 0) {
      done(img);
    }
  };
  return {
    loaded,
    onLoad: (event: SyntheticEvent<HTMLImageElement>) =>
      done(event.currentTarget),
    ref,
    tone,
  };
};

// One image filling the square frame. Keyed by its source, so a new image
// starts hidden behind the skeleton again.
const FrameImage = ({
  alt,
  art,
  dimmed,
  src,
}: {
  alt: string;
  art: boolean;
  dimmed: boolean | undefined;
  src: string;
}) => {
  const { loaded, onLoad, ref, tone } = useLoaded(art && optimizable(src));
  return (
    <>
      <div
        aria-hidden="true"
        className={cn(
          "absolute inset-0 transition-colors duration-300",
          BACKDROP[tone]
        )}
      />
      {loaded ? null : (
        <Skeleton
          aria-hidden="true"
          className="absolute inset-0 size-full rounded-none"
        />
      )}
      <Image
        alt={alt}
        className={cn(
          "absolute inset-0 size-full object-contain transition-opacity duration-300",
          loaded ? "opacity-100" : "opacity-0",
          dimmed && "grayscale"
        )}
        height={FRAME_SIZE}
        onLoad={onLoad}
        ref={ref}
        sizes={SIZES}
        src={src}
        unoptimized={!optimizable(src)}
        width={FRAME_SIZE}
      />
    </>
  );
};

// "On a shirt" is Fourthwall's own mockup of the art on the blank the product
// will use; "Flat art" is the artwork alone. Without a mockup (the preview
// failed, Fourthwall isn't connected, or the design predates previews) the
// shirt view shows the flat art and says why. The frame has a fixed aspect
// ratio, so nothing moves when the image arrives.
export const DesignPreview = ({
  title,
  artworkUrl,
  mockups = NO_MOCKUPS,
  mockupStatus = null,
  dimmed,
}: {
  title: string;
  artworkUrl: string;
  mockups?: string[] | undefined;
  mockupStatus?: MockupStatus | undefined;
  dimmed?: boolean;
}) => {
  const t = useTranslations("Wizard.designs");
  const [view, setView] = useState<View>("shirt");
  const [mockup] = mockupStatus === "ready" ? mockups : [];
  const onShirt = view === "shirt" && mockup !== undefined;
  const here = useHere();
  let notice: ReactNode = null;
  if (view === "shirt" && mockup === undefined) {
    // Not connected: the line itself is the way to connect, and back here.
    notice =
      mockupStatus === "not_connected" ? (
        <a
          className="text-accent-text font-medium underline underline-offset-4"
          href={connectUrl("fourthwall", here)}
        >
          {t("mockupNotConnected")}
        </a>
      ) : (
        t("mockupUnavailable")
      );
  }
  const src = onShirt ? mockup : artworkUrl;
  return (
    <div className="bg-muted flex flex-col gap-3 p-4">
      <div className="relative aspect-square w-full overflow-hidden">
        <FrameImage
          alt={onShirt ? t("shirtAlt", { title }) : t("artAlt", { title })}
          art={!onShirt}
          dimmed={dimmed}
          key={src}
          src={src}
        />
      </div>
      {notice === null ? null : (
        <output className="text-muted-foreground text-center text-xs">
          {notice}
        </output>
      )}
      <ToggleGroup
        aria-label={t("viewLabel")}
        className="self-center"
        onValueChange={(value) => {
          const [next] = value;
          if (next === "shirt" || next === "flat") {
            setView(next);
          }
        }}
        size="sm"
        value={[view]}
        variant="outline"
      >
        <ToggleGroupItem value="shirt">{t("viewShirt")}</ToggleGroupItem>
        <ToggleGroupItem value="flat">{t("viewFlat")}</ToggleGroupItem>
      </ToggleGroup>
    </div>
  );
};
