"use client";

import { Button } from "@wovain/ui/components/button";
import { Input } from "@wovain/ui/components/input";
import { Label } from "@wovain/ui/components/label";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useId, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { getPathname, Link, useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";

const MIN_PASSWORD = 8;

const Field = ({
  label,
  type,
  autoComplete,
  value,
  error,
  onChange,
}: {
  label: string;
  type: "email" | "password";
  autoComplete: string;
  value: string;
  error?: string | undefined;
  onChange: (value: string) => void;
}) => {
  const id = useId();
  return (
    <div className="flex flex-col gap-2">
      <Label className="text-sm font-semibold" htmlFor={id}>
        {label}
      </Label>
      <Input
        aria-describedby={error ? `${id}-error` : undefined}
        aria-invalid={error ? true : undefined}
        autoComplete={autoComplete}
        className="h-11 text-base md:text-sm"
        id={id}
        onChange={(event) => onChange(event.target.value)}
        required
        type={type}
        value={value}
      />
      {error ? (
        <p className="text-destructive text-sm" id={`${id}-error`}>
          {error}
        </p>
      ) : null}
    </div>
  );
};

/**
 * Without a token: asks for a reset link (Better Auth emails it). With the
 * `?token=` Better Auth adds to that link: sets the new password.
 */
export const ResetForm = () => {
  const t = useTranslations("Reset");
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const invalid = searchParams.get("error") !== null;
  const [value, setValue] = useState("");
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  const request = async () => {
    if (!z.email().safeParse(value).success) {
      setError(t("errors.email"));
      return;
    }
    setError(undefined);
    setPending(true);
    const { error: failed } = await authClient.requestPasswordReset({
      email: value,
      redirectTo: getPathname({ href: "/reset", locale }),
    });
    setPending(false);
    if (failed) {
      setError(t("errors.generic"));
      return;
    }
    setSent(true);
  };

  const reset = async (resetToken: string) => {
    if (value.length < MIN_PASSWORD) {
      setError(t("errors.password"));
      return;
    }
    setError(undefined);
    setPending(true);
    const { error: failed } = await authClient.resetPassword({
      newPassword: value,
      token: resetToken,
    });
    setPending(false);
    if (failed) {
      setError(t("errors.generic"));
      return;
    }
    toast.success(t("done"));
    router.push("/login");
  };

  return (
    <div className="w-full max-w-sm">
      <h1 className="font-expanded text-3xl leading-[1.05] font-black tracking-tight sm:text-4xl">
        {token ? t("title") : t("requestTitle")}
      </h1>
      <p className="text-muted-foreground mt-3">
        {token ? t("lead") : t("requestLead")}
      </p>
      {invalid ? (
        <p
          className="border-destructive/40 bg-destructive/10 text-destructive mt-6 border px-3 py-2 text-sm"
          role="alert"
        >
          {t("invalid")}
        </p>
      ) : null}
      {sent ? (
        <output className="border-border bg-card mt-8 block border p-4 text-sm">
          {t("sent")}
        </output>
      ) : (
        <form
          className="mt-8 flex flex-col gap-5"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            if (token) {
              reset(token);
            } else {
              request();
            }
          }}
        >
          <Field
            autoComplete={token ? "new-password" : "email"}
            error={error}
            label={token ? t("password") : t("email")}
            onChange={setValue}
            type={token ? "password" : "email"}
            value={value}
          />
          <Button
            className="h-11 w-full text-sm font-semibold"
            disabled={pending}
            type="submit"
          >
            {(() => {
              if (pending) {
                return t("submitting");
              }
              return token ? t("submit") : t("send");
            })()}
          </Button>
        </form>
      )}
      <p className="mt-6 text-sm">
        <Link className="text-primary font-semibold underline" href="/login">
          {t("back")}
        </Link>
      </p>
    </div>
  );
};
