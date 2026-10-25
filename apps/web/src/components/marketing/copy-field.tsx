"use client";

import { Button } from "@wovain/ui/components/button";
import { Check, Copy } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";

const RESET_MS = 2000;

/** A read-only value with a copy button, for the MCP server URL. */
export const CopyField = ({ value }: { value: string }) => {
  const t = useTranslations("Home");
  const id = useId();
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      <label
        className="font-condensed text-muted-foreground text-xs font-bold tracking-widest uppercase"
        htmlFor={id}
      >
        {t("mcpLabel")}
      </label>
      <div className="border-foreground/80 flex border">
        <input
          aria-describedby={`${id}-hint`}
          className="h-11 min-w-0 flex-1 bg-transparent px-3 font-mono text-sm"
          id={id}
          onFocus={(event) => event.target.select()}
          readOnly
          value={value}
        />
        <Button
          className="h-11 min-w-24 px-3 text-sm font-semibold"
          onClick={async () => {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), RESET_MS);
          }}
        >
          {copied ? (
            <Check aria-hidden="true" data-icon="inline-start" />
          ) : (
            <Copy aria-hidden="true" data-icon="inline-start" />
          )}
          <span aria-live="polite">{copied ? t("copied") : t("copy")}</span>
        </Button>
      </div>
      <p className="text-muted-foreground text-xs" id={`${id}-hint`}>
        {t("mcpHint")}
      </p>
    </div>
  );
};
