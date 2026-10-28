"use client";

import { Skeleton } from "@wovain/ui/components/skeleton";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@wovain/ui/components/toggle-group";
import { cn } from "@wovain/ui/lib/utils";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { useState } from "react";

const FRAME_SIZE = 640;
const SIZES = "(min-width: 1024px) 30vw, (min-width: 640px) 45vw, 100vw";

type View = "shirt" | "flat";

const NO_MOCKUPS: string[] = [];

type MockupStatus = "ready" | "failed" | "not_connected" | null;

// The image stays invisible until it has loaded; the skeleton holds the space.
const useLoaded = () => {
  const [loaded, setLoaded] = useState(false);
  const ref = (img: HTMLImageElement | null) => {
    // A cached image can finish loading before React attaches onLoad.
    if (img?.complete && img.naturalWidth > 0) {
      setLoaded(true);
    }
  };
  return { loaded, onLoad: () => setLoaded(true), ref };
};

// One image filling the square frame. Keyed by its source, so a new image
// starts hidden behind the skeleton again.
const FrameImage = ({
  alt,
  dimmed,
  src,
}: {
  alt: string;
  dimmed: boolean | undefined;
  src: string;
}) => {
  const { loaded, onLoad, ref } = useLoaded();
  return (
    <>
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
        unoptimized
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
  const notice =
    view === "shirt" && mockup === undefined
      ? t(
          mockupStatus === "not_connected"
            ? "mockupNotConnected"
            : "mockupUnavailable"
        )
      : null;
  const src = onShirt ? mockup : artworkUrl;
  return (
    <div className="bg-muted flex flex-col gap-3 p-4">
      <div className="relative aspect-square w-full overflow-hidden">
        <FrameImage
          alt={onShirt ? t("shirtAlt", { title }) : t("artAlt", { title })}
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
