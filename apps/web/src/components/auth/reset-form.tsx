"use client";

import { Field } from "@base-ui/react/field";
import { useForm } from "@tanstack/react-form";
import { Alert } from "@wovain/ui/components/alert";
import { Button } from "@wovain/ui/components/button";
import { Input } from "@wovain/ui/components/input";
import { Label } from "@wovain/ui/components/label";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { getPathname, Link, useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";

const MIN_PASSWORD = 8;

const alertClass = "border-destructive/40 bg-destructive/10 rounded-none px-3";

/**
 * Without a token: asks for a reset link (Better Auth emails it). With the
 * `?token=` Better Auth adds to that link: sets the new password. The page
 * reads the query on the server, so the form renders without a client bailout.
 */
export const ResetForm = ({
  token,
  invalid,
}: {
  token: string | null;
  invalid: boolean;
}) => {
  const t = useTranslations("Reset");
  const locale = useLocale();
  const router = useRouter();
  const [formError, setFormError] = useState<string>();
  const [sent, setSent] = useState(false);
  const name = token ? "password" : "email";

  const form = useForm({
    defaultValues: { email: "", password: "" },
    onSubmit: async ({ value }) => {
      setFormError(undefined);
      if (!token) {
        const { error } = await authClient.requestPasswordReset({
          email: value.email,
          redirectTo: getPathname({ href: "/reset", locale }),
        });
        if (error) {
          setFormError(t("errors.generic"));
          return;
        }
        setSent(true);
        return;
      }
      const { error } = await authClient.resetPassword({
        newPassword: value.password,
        token,
      });
      if (error) {
        setFormError(t("errors.generic"));
        return;
      }
      toast.success(t("done"));
      router.push("/login");
    },
    validators: {
      // Only the field on screen is checked: email without a token, else password.
      onSubmit: z.object({
        email: token ? z.string() : z.email(t("errors.email")),
        password: token
          ? z.string().min(MIN_PASSWORD, t("errors.password"))
          : z.string(),
      }),
    },
  });

  return (
    <div className="w-full max-w-sm">
      <h1 className="font-display text-2xl font-semibold tracking-[-0.025em] sm:text-3xl">
        {token ? t("title") : t("requestTitle")}
      </h1>
      <p className="text-muted-foreground mt-3">
        {token ? t("lead") : t("requestLead")}
      </p>
      {invalid ? (
        <Alert className={`${alertClass} mt-6`} variant="destructive">
          {t("invalid")}
        </Alert>
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
            event.stopPropagation();
            form.handleSubmit();
          }}
        >
          {formError ? (
            <Alert className={alertClass} variant="destructive">
              {formError}
            </Alert>
          ) : null}
          <form.Field name={name}>
            {(field) => {
              const error = field.state.meta.errors[0]?.message;
              return (
                <Field.Root
                  className="flex flex-col gap-2"
                  invalid={Boolean(error)}
                  name={field.name}
                >
                  <Field.Label render={<Label />}>
                    {token ? t("password") : t("email")}
                  </Field.Label>
                  <Input
                    autoComplete={token ? "new-password" : "email"}
                    className="h-11 text-base md:text-sm"
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                    required
                    type={name}
                    value={field.state.value}
                  />
                  {error ? (
                    <Field.Error className="text-destructive text-sm" match>
                      {error}
                    </Field.Error>
                  ) : null}
                </Field.Root>
              );
            }}
          </form.Field>
          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(isSubmitting) => (
              <Button
                className="h-11 w-full text-sm font-medium"
                disabled={isSubmitting}
                type="submit"
              >
                {(() => {
                  if (isSubmitting) {
                    return t("submitting");
                  }
                  return token ? t("submit") : t("send");
                })()}
              </Button>
            )}
          </form.Subscribe>
        </form>
      )}
      <p className="mt-6 text-sm">
        <Link
          className="text-accent-text font-medium hover:underline"
          href="/login"
        >
          {t("back")}
        </Link>
      </p>
    </div>
  );
};
