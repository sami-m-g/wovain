"use client";

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
      <label className="text-sm font-medium" htmlFor={id}>
        {t("mcpLabel")}
      </label>
      <div className="border-input bg-card focus-within:ring-ring/30 flex rounded-xl border p-1 focus-within:ring-3">
        <input
          aria-describedby={`${id}-hint`}
          className="h-10 min-w-0 flex-1 bg-transparent px-3 font-mono text-sm outline-none"
          id={id}
          onFocus={(event) => event.target.select()}
          readOnly
          value={value}
        />
        <button
          className="bg-primary text-primary-foreground hover:bg-primary/85 focus-visible:ring-ring/50 inline-flex h-10 min-w-24 shrink-0 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-3 [&_svg]:size-4"
          type="button"
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
        </button>
      </div>
      <p className="text-muted-foreground text-xs" id={`${id}-hint`}>
        {t("mcpHint")}
      </p>
    </div>
  );
};
