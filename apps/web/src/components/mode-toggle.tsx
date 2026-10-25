"use client";

import { Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";

/**
 * Switches between light and dark. A plain button (no menu) keeps it light on
 * every page; the system preference is the default until the visitor chooses.
 */
export const ModeToggle = () => {
  const { resolvedTheme, setTheme } = useTheme();
  const t = useTranslations("Common");

  return (
    <button
      aria-label={t("toggleTheme")}
      className="border-input bg-background hover:bg-muted focus-visible:ring-ring/50 relative inline-flex size-10 shrink-0 items-center justify-center rounded-lg border transition-colors outline-none focus-visible:ring-3"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      type="button"
    >
      <Sun
        aria-hidden="true"
        className="size-4 scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90"
      />
      <Moon
        aria-hidden="true"
        className="absolute size-4 scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0"
      />
    </button>
  );
};
