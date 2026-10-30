"use client";

import { ORPCError } from "@orpc/client";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@wovain/ui/components/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@wovain/ui/components/field";
import { Input } from "@wovain/ui/components/input";
import { cn } from "@wovain/ui/lib/utils";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import type { FormEvent } from "react";

import { usePathname, useRouter } from "@/i18n/navigation";
import { orpc } from "@/utils/orpc";

/** Polar's checkout lives on another origin. */
const leaveFor = (url: string) => window.location.assign(url);

type RedeemErrorKey =
  | "alreadyRedeemed"
  | "emailLinked"
  | "emailNotVerified"
  | "error"
  | "expired"
  | "invalid"
  | "notFree"
  | "tooMany"
  | "usedUp";

// The API's typed refusals, by the message key that words them.
const ERROR_KEYS: Record<string, RedeemErrorKey> = {
  BILLING_EMAIL_LINKED: "emailLinked",
  BILLING_EMAIL_NOT_VERIFIED: "emailNotVerified",
  PROMO_ALREADY_REDEEMED: "alreadyRedeemed",
  PROMO_EXPIRED: "expired",
  PROMO_INVALID: "invalid",
  PROMO_NOT_FREE: "notFree",
  PROMO_USED_UP: "usedUp",
  TOO_MANY_REQUESTS: "tooMany",
};

const errorKey = (error: unknown): RedeemErrorKey =>
  error instanceof ORPCError && error.defined
    ? (ERROR_KEYS[String(error.code)] ?? "error")
    : "error";

/**
 * Redeems a promo code for credits. A free code is confirmed without
 * leaving the page; the credits arrive a few seconds later, so the page
 * reloads its status with `?redeemed=1` and polls.
 */
export const RedeemCode = ({
  className,
  disabled = false,
}: {
  className?: string;
  disabled?: boolean;
}) => {
  const t = useTranslations("Billing.redeem");
  const id = useId();
  const router = useRouter();
  const pathname = usePathname();
  const [code, setCode] = useState("");
  const redeem = useMutation(
    orpc.billing.redeem.mutationOptions({
      onSuccess: (result) => {
        if (result.status === "checkout") {
          leaveFor(result.url);
          return;
        }
        setCode("");
        router.replace(`${pathname}?redeemed=1`);
      },
    })
  );
  const failed = redeem.isError ? errorKey(redeem.error) : undefined;
  const busy = redeem.isPending || redeem.data?.status === "checkout";

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const typed = code.trim();
    if (typed === "" || busy) {
      return;
    }
    redeem.mutate({ code: typed, surface: "billing" });
  };

  return (
    <section
      aria-labelledby={`${id}-title`}
      className={cn(
        "border-border bg-card flex flex-col gap-4 rounded-xl border p-5",
        className
      )}
    >
      <div className="flex flex-col gap-1">
        <h2
          className="font-display text-lg font-semibold tracking-[-0.02em]"
          id={`${id}-title`}
        >
          {t("title")}
        </h2>
        <p className="text-muted-foreground text-sm">{t("lead")}</p>
      </div>
      <form className="flex flex-col gap-3" noValidate onSubmit={submit}>
        <Field data-invalid={failed === undefined ? undefined : true}>
          <FieldLabel htmlFor={`${id}-code`}>{t("label")}</FieldLabel>
          <Input
            aria-describedby={`${id}-hint`}
            aria-invalid={failed === undefined ? undefined : true}
            autoCapitalize="characters"
            autoComplete="off"
            className="h-11 font-mono tracking-[0.08em] uppercase sm:h-9"
            disabled={disabled || busy}
            id={`${id}-code`}
            maxLength={64}
            name="code"
            onChange={(event) => {
              setCode(event.target.value);
              if (redeem.isError) {
                redeem.reset();
              }
            }}
            placeholder={t("placeholder")}
            spellCheck={false}
            value={code}
          />
          {failed === undefined ? (
            <FieldDescription id={`${id}-hint`}>{t("hint")}</FieldDescription>
          ) : (
            <FieldError id={`${id}-hint`}>{t(`errors.${failed}`)}</FieldError>
          )}
        </Field>
        <Button
          className="h-11 rounded-lg px-4 sm:h-9"
          disabled={disabled || busy || code.trim() === ""}
          type="submit"
        >
          {busy ? t("redeeming") : t("submit")}
        </Button>
      </form>
    </section>
  );
};
