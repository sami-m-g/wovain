"use client";

import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@wovain/ui/components/carousel";
import type { CarouselApi } from "@wovain/ui/components/carousel";
import { useReducedMotion } from "motion/react";
import { useFormatter, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

// Embla's slide speed (its default), and the fastest it goes: with reduced
// motion a slide changes at once instead of gliding.
const GLIDE = 25;
const INSTANT = 1;

/**
 * Ideas one card at a time (shadcn Carousel, Embla): the arrow buttons or
 * the keyboard arrows move between them, a swipe on touch screens, and the
 * position ("2 of 5") is shown and read out politely.
 */
export const IdeaCarousel = ({
  items,
  label,
}: {
  items: readonly { key: string; node: ReactNode }[];
  label: string;
}) => {
  const t = useTranslations("Wizard.directions.carousel");
  const format = useFormatter();
  const reduced = useReducedMotion() === true;
  const [api, setApi] = useState<CarouselApi>();
  const [current, setCurrent] = useState(0);
  useEffect(() => {
    if (api === undefined) {
      return;
    }
    const select = () => setCurrent(api.selectedScrollSnap());
    select();
    api.on("select", select);
    api.on("reInit", select);
    return () => {
      api.off("select", select);
      api.off("reInit", select);
    };
  }, [api]);
  const total = items.length;
  return (
    <Carousel
      aria-label={label}
      className="flex flex-col gap-3"
      opts={{ align: "start", duration: reduced ? INSTANT : GLIDE }}
      setApi={setApi}
    >
      <CarouselContent>
        {items.map((item, index) => (
          <CarouselItem
            aria-label={t("position", {
              current: format.number(index + 1),
              total: format.number(total),
            })}
            key={item.key}
          >
            {item.node}
          </CarouselItem>
        ))}
      </CarouselContent>
      {total > 1 ? (
        <div className="flex items-center justify-center gap-3">
          <CarouselPrevious
            aria-label={t("previous")}
            className="static inset-auto my-0 size-9 translate-none"
          />
          <p
            aria-live="polite"
            className="figures text-muted-foreground min-w-16 text-center text-sm"
          >
            {t("position", {
              current: format.number(Math.min(current + 1, total)),
              total: format.number(total),
            })}
          </p>
          <CarouselNext
            aria-label={t("next")}
            className="static inset-auto my-0 size-9 translate-none"
          />
        </div>
      ) : null}
    </Carousel>
  );
};
