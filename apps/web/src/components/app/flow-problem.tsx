"use client";

import { Alert, AlertDescription } from "@wovain/ui/components/alert";
import { CircleAlert } from "lucide-react";
import { useTranslations } from "next-intl";

import { Paywall } from "@/components/billing/paywall";
import { Link } from "@/i18n/navigation";
import type { FlowProblem } from "@/lib/flow-client";

const SERVICE_NAMES: Record<string, string> = {
  fal: "fal",
  fourthwall: "Fourthwall",
  meta: "Meta",
  polar: "Polar",
};

/**
 * A friendly, per-step explanation of why a procedure couldn't run. Running
 * out of credits or needing a paid plan opens the paywall instead, which
 * `onDismiss` closes.
 */
export const FlowProblemNotice = ({
  problem,
  onDismiss,
}: {
  problem: FlowProblem;
  onDismiss?: () => void;
}) => {
  const t = useTranslations("Wizard.problem");

  if (problem.kind === "credits" || problem.kind === "plan") {
    return (
      <Paywall
        available={problem.kind === "credits" ? problem.available : undefined}
        fix={problem.fix}
        kind={problem.kind}
        message={problem.message}
        needed={problem.kind === "credits" ? problem.needed : undefined}
        onDismiss={onDismiss}
      />
    );
  }

  let body: React.ReactNode = null;
  if (problem.kind === "not_connected") {
    body = (
      <>
        {t("notConnected", {
          service: SERVICE_NAMES[problem.service] ?? problem.service,
        })}{" "}
        <Link className="font-semibold" href="/dashboard/connections">
          {t("connectLink")}
        </Link>
      </>
    );
  } else if (problem.kind === "not_configured") {
    // Server set-up is wovain's job: the designer sees no vendor or variable names.
    body = t("notConfigured");
  } else if (problem.kind === "limit") {
    body = [problem.message, problem.fix].filter(Boolean).join(". ");
  } else {
    body = t("other", { message: problem.message });
  }

  return (
    <Alert variant={problem.kind === "other" ? "destructive" : "default"}>
      <CircleAlert aria-hidden="true" />
      <AlertDescription className="text-foreground text-sm">
        {body}
      </AlertDescription>
    </Alert>
  );
};
