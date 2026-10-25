"use client";

import { useForm } from "@tanstack/react-form";
import { Button } from "@wovain/ui/components/button";
import { Input } from "@wovain/ui/components/input";
import { Label } from "@wovain/ui/components/label";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { Link, useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";

type Mode = "login" | "signUp";

const MIN_NAME = 2;
const MIN_PASSWORD = 8;

/** Only same-app paths are allowed as a post-login destination. */
const safeNext = (value: string | null) =>
  value?.startsWith("/dashboard") ? value : "/dashboard";

const fieldError = (errors: unknown[]): string | undefined => {
  const [first] = errors;
  if (typeof first === "string") {
    return first;
  }
  return first && typeof first === "object" && "message" in first
    ? String(first.message)
    : undefined;
};

export const AuthForm = ({ mode }: { mode: Mode }) => {
  const t = useTranslations("Auth");
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeNext(searchParams.get("next"));
  // ChatGPT (or another OAuth client) is signing in: Better Auth follows the
  // signed query back to the authorization, so the form must not navigate.
  const inOAuthFlow =
    searchParams.has("sig") || searchParams.has("oauth_query");
  const [formError, setFormError] = useState<string>();

  const schema = z.object({
    email: z.email(t("errors.email")),
    name:
      mode === "signUp"
        ? z.string().trim().min(MIN_NAME, t("errors.name"))
        : z.string(),
    password: z.string().min(MIN_PASSWORD, t("errors.password")),
  });

  const errorMessage = (code?: string) => {
    if (code === "INVALID_EMAIL_OR_PASSWORD") {
      return t("errors.invalidCredentials");
    }
    if (code?.startsWith("USER_ALREADY_EXISTS")) {
      return t("errors.userExists");
    }
    return t("errors.generic");
  };

  const form = useForm({
    defaultValues: { email: "", name: "", password: "" },
    onSubmit: async ({ value }) => {
      setFormError(undefined);
      const { error } = await (mode === "signUp"
        ? authClient.signUp.email({
            email: value.email,
            // Saved on the user so wovain's emails match the site's language.
            locale,
            name: value.name,
            password: value.password,
          })
        : authClient.signIn.email({
            email: value.email,
            password: value.password,
          }));
      if (error) {
        setFormError(errorMessage(error.code));
        return;
      }
      toast.success(mode === "signUp" ? t("created") : t("welcome"));
      if (inOAuthFlow) {
        return;
      }
      router.push(mode === "signUp" ? "/dashboard/connections" : next);
    },
    validators: { onSubmit: schema },
  });

  const fields =
    mode === "signUp"
      ? (["name", "email", "password"] as const)
      : (["email", "password"] as const);

  return (
    <div className="w-full max-w-sm">
      <h1 className="font-expanded text-3xl leading-[1.05] font-black tracking-tight sm:text-4xl">
        {mode === "signUp" ? t("signUpTitle") : t("loginTitle")}
      </h1>
      <p className="text-muted-foreground mt-3">
        {mode === "signUp" ? t("signUpLead") : t("loginLead")}
      </p>

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
          <p
            className="border-destructive/40 bg-destructive/10 text-destructive border px-3 py-2 text-sm"
            role="alert"
          >
            {formError}
          </p>
        ) : null}
        {fields.map((name) => (
          <form.Field key={name} name={name}>
            {(field) => {
              const error = fieldError(field.state.meta.errors);
              const errorId = `${field.name}-error`;
              const hintId = `${field.name}-hint`;
              const describedBy =
                [
                  name === "password" && mode === "signUp" ? hintId : null,
                  error ? errorId : null,
                ]
                  .filter(Boolean)
                  .join(" ") || undefined;
              return (
                <div className="flex flex-col gap-2">
                  <Label className="text-sm font-semibold" htmlFor={field.name}>
                    {t(name)}
                  </Label>
                  <Input
                    aria-describedby={describedBy}
                    aria-invalid={error ? true : undefined}
                    autoComplete={
                      {
                        email: "email",
                        name: "name",
                        password:
                          mode === "signUp"
                            ? "new-password"
                            : "current-password",
                      }[name]
                    }
                    className="h-11 text-base md:text-sm"
                    id={field.name}
                    name={field.name}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                    required
                    type={
                      { email: "email", name: "text", password: "password" }[
                        name
                      ]
                    }
                    value={field.state.value}
                  />
                  {name === "password" && mode === "signUp" ? (
                    <p className="text-muted-foreground text-xs" id={hintId}>
                      {t("passwordHint")}
                    </p>
                  ) : null}
                  {error ? (
                    <p className="text-destructive text-sm" id={errorId}>
                      {error}
                    </p>
                  ) : null}
                </div>
              );
            }}
          </form.Field>
        ))}

        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <Button
              className="h-11 w-full text-sm font-semibold"
              disabled={isSubmitting}
              type="submit"
            >
              {(() => {
                if (isSubmitting) {
                  return t("submitting");
                }
                return mode === "signUp" ? t("submitSignUp") : t("submitLogin");
              })()}
            </Button>
          )}
        </form.Subscribe>
      </form>

      <p className="text-muted-foreground mt-6 text-sm">
        {mode === "signUp" ? t("toLogin") : t("toSignUp")}{" "}
        <Link
          className="text-primary font-semibold underline"
          href={{
            pathname: mode === "signUp" ? "/login" : "/sign-up",
            query: Object.fromEntries(searchParams.entries()),
          }}
        >
          {mode === "signUp" ? t("toLoginLink") : t("toSignUpLink")}
        </Link>
      </p>
      {mode === "login" ? (
        <p className="mt-2 text-sm">
          <Link className="text-primary font-semibold underline" href="/reset">
            {t("forgot")}
          </Link>
        </p>
      ) : null}
    </div>
  );
};
