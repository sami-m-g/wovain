import { ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";

// Numbered source links under a claim, so every piece of evidence wovain
// shows can be opened and checked. The pattern follows Vercel AI Elements'
// Sources and InlineCitation (Apache-2.0); it's written on wovain's own
// Base UI kit because AI Elements ships Radix components.

export interface Citation {
  title: string;
  url: string;
}

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./u, "");
  } catch {
    return url;
  }
};

export const Citations = ({
  citations,
  label,
  max = 5,
}: {
  citations: Citation[];
  label?: string | undefined;
  max?: number | undefined;
}) => {
  const t = useTranslations("Wizard.evidence");
  if (citations.length === 0) {
    return null;
  }
  return (
    <ol
      aria-label={label ?? t("sources")}
      className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs"
    >
      {citations.slice(0, max).map((citation, index) => (
        <li key={citation.url}>
          <a
            className="text-accent-text inline-flex min-h-6 max-w-56 items-center gap-1 font-semibold underline"
            href={citation.url}
            rel="noopener noreferrer"
            target="_blank"
            title={citation.title}
          >
            <span className="figures">[{index + 1}]</span>
            <span className="truncate">{hostOf(citation.url)}</span>
            <ExternalLink aria-hidden="true" className="size-3 shrink-0" />
          </a>
        </li>
      ))}
    </ol>
  );
};
