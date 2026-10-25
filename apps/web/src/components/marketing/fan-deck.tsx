import { cn } from "@wovain/ui/lib/utils";
import { getTranslations } from "next-intl/server";

import { INK_HEX, inkField, STAGE_INK } from "@/components/brand/swatch";

const CHIPS = [
  "brief",
  "trends",
  "designs",
  "products",
  "ads",
  "campaign",
] as const;

/**
 * Rest and open angles per chip (degrees), back to front. The deck pivots on
 * one rivet at the bottom, like a printer's fan guide, and opens on hover or
 * keyboard focus.
 */
const FAN = [
  "-rotate-[30deg] group-hover/deck:-rotate-[52deg] group-focus-within/deck:-rotate-[52deg]",
  "-rotate-[21deg] group-hover/deck:-rotate-[36deg] group-focus-within/deck:-rotate-[36deg]",
  "-rotate-[13deg] group-hover/deck:-rotate-[20deg] group-focus-within/deck:-rotate-[20deg]",
  "-rotate-[6deg] group-hover/deck:-rotate-[4deg] group-focus-within/deck:-rotate-[4deg]",
  "rotate-[1deg] group-hover/deck:rotate-[12deg] group-focus-within/deck:rotate-[12deg]",
  "rotate-[8deg] group-hover/deck:rotate-[28deg] group-focus-within/deck:rotate-[28deg]",
] as const;

export const FanDeck = async ({ className }: { className?: string }) => {
  const t = await getTranslations("Home");
  const common = await getTranslations("Common");

  return (
    <figure className={cn("relative", className)}>
      <ol
        aria-label={t("deckLabel")}
        className="group/deck relative mx-auto h-[25rem] w-full max-w-[26rem] outline-offset-8 sm:h-[29rem]"
        // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- lets keyboard users open the fan
        tabIndex={0}
      >
        {CHIPS.map((chip, index) => {
          const ink = STAGE_INK[chip];
          return (
            <li
              className={cn(
                "bg-card absolute start-1/2 bottom-6 -ms-[4.75rem] flex h-[21rem] w-[9.5rem] origin-[50%_calc(100%-1.25rem)] flex-col shadow-[0_1px_2px_rgb(20_22_46/0.12),0_18px_40px_-18px_rgb(20_22_46/0.45)] transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none sm:-ms-[5.25rem] sm:h-[24rem] sm:w-[10.5rem]",
                FAN[index]
              )}
              key={chip}
            >
              <div
                className={cn(
                  "flex flex-1 flex-col justify-between p-3",
                  inkField[ink]
                )}
              >
                <span className="font-condensed text-xs font-semibold tracking-widest uppercase tabular-nums">
                  {`WV ${String(index + 1).padStart(2, "0")}`}
                </span>
                <span className="font-semi-expanded text-xl leading-tight font-extrabold">
                  {t(`chips.${chip}.name`)}
                </span>
              </div>
              <div className="flex h-32 flex-col justify-between p-3 sm:h-36">
                <span className="text-sm leading-snug font-medium">
                  {t(`chips.${chip}.value`)}
                </span>
                <span className="font-condensed text-muted-foreground flex items-center justify-between text-xs tracking-wide tabular-nums">
                  {INK_HEX[ink]}
                  <span
                    aria-hidden="true"
                    className="border-input bg-background size-2.5 rounded-full border"
                  />
                </span>
              </div>
            </li>
          );
        })}
      </ol>
      <figcaption className="text-muted-foreground mt-2 text-center text-xs">
        {t("deckCaption")} · {common("demoData")}
      </figcaption>
    </figure>
  );
};
