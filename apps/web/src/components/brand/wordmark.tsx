import { cn } from "@wovain/ui/lib/utils";

/** The mark: an indigo ink chip with its white code strip and a rivet hole. */
const ChipMark = ({ className }: { className?: string }) => (
  <svg
    aria-hidden="true"
    className={cn("size-6 shrink-0", className)}
    viewBox="0 0 24 24"
  >
    <rect fill="var(--ink-indigo)" height="24" width="24" />
    <rect fill="#ffffff" height="6" width="20" x="2" y="16" />
    <circle cx="6" cy="6" fill="var(--ink-paper)" r="2" />
  </svg>
);

export const Wordmark = ({ className }: { className?: string }) => (
  <span
    className={cn(
      "font-expanded inline-flex items-center gap-2 text-lg font-black tracking-tight lowercase",
      className
    )}
  >
    <ChipMark />
    wovain
  </span>
);
