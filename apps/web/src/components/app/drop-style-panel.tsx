"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@wovain/ui/components/button";
import { Skeleton } from "@wovain/ui/components/skeleton";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@wovain/ui/components/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@wovain/ui/components/tooltip";
import { Info, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { toast } from "sonner";

import { PaletteMockup } from "@/components/app/brand-discovery";
import { orpc } from "@/utils/orpc";

const NOT_FOUND = 404;

const statusOf = (error: unknown) =>
  typeof error === "object" && error !== null && "status" in error
    ? (error as { status?: unknown }).status
    : undefined;

/** A heading with an info tooltip that gives an example. */
const Heading = ({ label, tip }: { label: string; tip: string }) => {
  const id = useId();
  const t = useTranslations("Wizard.style");
  return (
    <div className="flex items-center gap-1.5">
      <h4 className="text-xs font-semibold">{label}</h4>
      <Tooltip>
        <TooltipTrigger
          aria-describedby={id}
          aria-label={t("info", { field: label })}
          className="text-muted-foreground hover:text-foreground focus-visible:ring-ring rounded-full p-0.5 outline-none focus-visible:ring-2"
          type="button"
        >
          <Info aria-hidden="true" className="size-3.5" />
        </TooltipTrigger>
        <TooltipContent className="max-w-72" id={id}>
          {tip}
        </TooltipContent>
      </Tooltip>
    </div>
  );
};

/**
 * This drop's own tone and colours, suggested from its Qloo audience and the
 * brand's defaults; the merchant picks one of each. The brief and the ads
 * are written in them.
 */
export const DropStylePanel = ({ ideaId }: { ideaId: string }) => {
  const t = useTranslations("Wizard.style");
  const queryClient = useQueryClient();
  const options = orpc.ideas.style.queryOptions({
    input: { ideaId },
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const style = useQuery(options);
  const pick = useMutation(
    orpc.ideas.pickStyle.mutationOptions({
      onError: (error) => toast.error(error.message),
      onSuccess: (next) => queryClient.setQueryData(options.queryKey, next),
    })
  );
  // The drop-style flag is off: nothing to show.
  if (style.isError && statusOf(style.error) === NOT_FOUND) {
    return null;
  }
  if (style.isError) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted-foreground">{t("failed")}</span>
        <Button
          onClick={async () => {
            await style.refetch();
          }}
          size="sm"
          type="button"
          variant="outline"
        >
          <RefreshCw aria-hidden="true" data-icon="inline-start" />
          {t("retry")}
        </Button>
      </div>
    );
  }
  if (style.data === undefined) {
    return (
      <div aria-busy="true" className="flex flex-col gap-2">
        <span className="text-muted-foreground text-xs">{t("loading")}</span>
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-10 w-2/3" />
      </div>
    );
  }
  const { palette, palettes, tone, tones } = style.data;
  const toneIndex = tones.findIndex((one) => one.line === tone?.line);
  const paletteIndex = palettes.findIndex(
    (one) => one.inks.join(",") === palette?.inks.join(",")
  );
  return (
    <TooltipProvider>
      <section
        aria-label={t("title")}
        className="bg-muted/40 flex flex-col gap-3 rounded-lg p-3"
      >
        <div className="flex flex-col gap-1.5">
          <Heading label={t("tone")} tip={t("toneTip")} />
          <ToggleGroup
            aria-label={t("tone")}
            className="flex flex-col items-stretch gap-1.5"
            disabled={pick.isPending}
            onValueChange={(value) => {
              const [next] = value;
              if (next !== undefined) {
                pick.mutate({ ideaId, tone: Number(next) });
              }
            }}
            value={toneIndex === -1 ? [] : [String(toneIndex)]}
          >
            {tones.map((one, index) => (
              <ToggleGroupItem
                className="aria-pressed:border-primary aria-pressed:bg-accent-soft h-auto min-h-9 flex-col items-start justify-start gap-0.5 rounded-md border px-2.5 py-1.5 text-start whitespace-normal"
                key={one.line}
                value={String(index)}
              >
                <span className="text-xs font-medium">{one.label}</span>
                <span className="text-muted-foreground text-xs font-normal">
                  “{one.line}”
                </span>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
        <div className="flex flex-col gap-1.5">
          <Heading label={t("colours")} tip={t("coloursTip")} />
          {palettes.length === 0 ? (
            <p className="text-muted-foreground text-xs">{t("noColours")}</p>
          ) : (
            <ToggleGroup
              aria-label={t("colours")}
              className="flex flex-wrap gap-1.5"
              disabled={pick.isPending}
              onValueChange={(value) => {
                const [next] = value;
                if (next !== undefined) {
                  pick.mutate({ ideaId, palette: Number(next) });
                }
              }}
              value={paletteIndex === -1 ? [] : [String(paletteIndex)]}
            >
              {palettes.map((one, index) => (
                <ToggleGroupItem
                  className="aria-pressed:border-primary aria-pressed:bg-accent-soft h-auto flex-col items-start gap-1 rounded-md border p-2"
                  key={one.inks.join(",")}
                  value={String(index)}
                >
                  <PaletteMockup palette={one} size="sm" />
                  <span className="text-xs">{one.label}</span>
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          )}
          <p className="text-muted-foreground text-[0.7rem]">
            {t("checkedOn", { blank: style.data.blank })}
          </p>
        </div>
        {style.data.guardrails === undefined ? null : (
          <p className="text-muted-foreground text-xs">
            {t("guardrails", { voice: style.data.guardrails })}
          </p>
        )}
        <p className="text-muted-foreground text-[0.7rem]">{t("source")}</p>
      </section>
    </TooltipProvider>
  );
};
