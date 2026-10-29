"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { toast } from "sonner";

import { usePathname, useRouter } from "@/i18n/navigation";
import { PROVIDERS } from "@/lib/flow-client";

/**
 * Provider callbacks come back with `?connected=<provider>` or
 * `?connection_error=<code>`; this shows the toast and tidies the URL.
 */
export const ConnectionToasts = () => {
  const t = useTranslations("Connections");
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const connected = searchParams.get("connected");
  const failed = searchParams.get("connection_error");

  useEffect(() => {
    if (connected === null && failed === null) {
      return;
    }
    const provider = PROVIDERS.find((item) => item === connected);
    if (provider) {
      toast.success(
        t("connectedToast", { name: t(`providers.${provider}.name`) })
      );
    } else if (failed !== null) {
      toast.error(t("failedToast", { code: failed }));
    }
    // Every query: one that failed for want of this connection reads again.
    queryClient.invalidateQueries();
    // Keeps the rest of the URL (a run's `?run=`), so the merchant is back
    // where they started connecting.
    const rest = new URLSearchParams(searchParams.toString());
    rest.delete("connected");
    rest.delete("connection_error");
    const query = rest.toString();
    router.replace(query === "" ? pathname : `${pathname}?${query}`);
  }, [connected, failed, pathname, queryClient, router, searchParams, t]);

  return null;
};
