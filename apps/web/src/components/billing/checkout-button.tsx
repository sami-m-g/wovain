"use client";

import { useMutation } from "@tanstack/react-query";
import type { Offer } from "@wovain/billing/plans";
import { Button } from "@wovain/ui/components/button";
import { cn } from "@wovain/ui/lib/utils";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { toast } from "sonner";

import { describeProblem } from "@/lib/flow-client";
import { orpc } from "@/utils/orpc";

/** Polar's hosted pages (checkout, portal) live on another origin. */
const leaveFor = (url: string) => window.location.assign(url);

const SIZE = "h-11 rounded-lg px-4 sm:h-9";

/** Opens Polar's checkout for a plan or the credit pack. */
export const CheckoutButton = ({
  offer,
  primary = false,
  disabled = false,
  children,
}: {
  offer: Offer;
  primary?: boolean;
  disabled?: boolean;
  children: ReactNode;
}) => {
  const t = useTranslations("Billing");
  const checkout = useMutation(
    orpc.billing.checkout.mutationOptions({
      // Paid plans switched off since the page loaded
      // (PAID_PLANS_NOT_AVAILABLE): the server says why, in the merchant's
      // language.
      onError: (error) => {
        const problem = describeProblem(error);
        toast.error(
          problem.kind === "limit"
            ? [problem.message, problem.fix].filter(Boolean).join(". ")
            : t("checkoutError")
        );
      },
      onSuccess: ({ url }) => leaveFor(url),
    })
  );
  return (
    <Button
      className={SIZE}
      disabled={disabled || checkout.isPending || checkout.isSuccess}
      onClick={() => checkout.mutate({ offer })}
      variant={primary ? "default" : "outline"}
    >
      {checkout.isPending || checkout.isSuccess ? t("opening") : children}
    </Button>
  );
};

/** Opens Polar's customer portal: plan changes, cancelling, invoices. */
export const PortalButton = ({
  disabled = false,
  className,
}: {
  disabled?: boolean;
  className?: string;
}) => {
  const t = useTranslations("Billing");
  const portal = useMutation(
    orpc.billing.portal.mutationOptions({
      onError: () => toast.error(t("portalError")),
      onSuccess: ({ url }) => leaveFor(url),
    })
  );
  return (
    <Button
      className={cn(SIZE, className)}
      disabled={disabled || portal.isPending || portal.isSuccess}
      onClick={() => portal.mutate({})}
      variant="outline"
    >
      {portal.isPending || portal.isSuccess ? t("opening") : t("manage")}
    </Button>
  );
};
