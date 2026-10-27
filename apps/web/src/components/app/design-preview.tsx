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

const FLAT_SIZE = 640;
const SIZES = "(min-width: 1024px) 30vw, (min-width: 640px) 45vw, 100vw";

type View = "shirt" | "flat";

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

// A neutral tee, drawn once, in the page's own colors.
const Tee = () => (
  <svg
    aria-hidden="true"
    className="text-card absolute inset-0 size-full drop-shadow-sm"
    fill="currentColor"
    stroke="var(--border)"
    strokeLinejoin="round"
    strokeWidth="1.5"
    viewBox="0 0 100 100"
  >
    <path d="M36 12c3 5 8 8 14 8s11-3 14-8l22 8 9 20-14 6-3-6v46H22V40l-3 6-14-6 9-20 22-8z" />
  </svg>
);

// The artwork on a neutral tee (Fourthwall renders the real mockup only once
// the product exists), with the flat artwork as a second view. The frame has
// a fixed aspect ratio, so nothing moves when the image arrives.
export const DesignPreview = ({
  title,
  artworkUrl,
  dimmed,
}: {
  title: string;
  artworkUrl: string;
  dimmed?: boolean;
}) => {
  const t = useTranslations("Wizard.designs");
  const [view, setView] = useState<View>("shirt");
  const { loaded, onLoad, ref } = useLoaded();
  const flat = view === "flat";
  return (
    <div className="bg-muted flex flex-col gap-3 p-4">
      <div className="relative aspect-square w-full overflow-hidden">
        {loaded ? null : (
          <Skeleton
            aria-hidden="true"
            className="absolute inset-0 size-full rounded-none"
          />
        )}
        {flat ? null : <Tee />}
        <Image
          alt={flat ? t("artAlt", { title }) : t("shirtAlt", { title })}
          className={cn(
            "absolute object-contain transition-opacity duration-300",
            flat ? "inset-0 size-full" : "top-[26%] left-[34%] h-[34%] w-[32%]",
            loaded ? "opacity-100" : "opacity-0",
            dimmed && "grayscale"
          )}
          height={FLAT_SIZE}
          onLoad={onLoad}
          ref={ref}
          sizes={SIZES}
          src={artworkUrl}
          unoptimized
          width={FLAT_SIZE}
        />
      </div>
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
