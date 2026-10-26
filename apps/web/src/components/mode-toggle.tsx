"use client";

import { Button } from "@wovain/ui/components/button";
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
    <Button
      aria-label={t("toggleTheme")}
      className="relative"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      size="icon"
      variant="outline"
    >
      <Sun
        aria-hidden="true"
        className="scale-100 rotate-0 transition-transform motion-reduce:transition-none dark:scale-0 dark:-rotate-90"
      />
      <Moon
        aria-hidden="true"
        className="absolute scale-0 rotate-90 transition-transform motion-reduce:transition-none dark:scale-100 dark:rotate-0"
      />
    </Button>
  );
};
