"use client";

import { Alert, AlertDescription } from "@wovain/ui/components/alert";
import { CircleAlert } from "lucide-react";
import { useTranslations } from "next-intl";

import { ConnectState, useConnectable } from "@/components/app/connect-state";
import { Paywall } from "@/components/billing/paywall";
import type { FlowProblem, Provider } from "@/lib/flow-client";
import { PROVIDERS } from "@/lib/flow-client";

const providerOf = (problem: FlowProblem): Provider | undefined =>
  problem.kind === "not_connected"
    ? PROVIDERS.find((each) => each === problem.service)
    : undefined;

/**
 * A friendly, per-step explanation of why a procedure couldn't run. Running
 * out of credits or needing a paid plan opens the paywall instead, which
 * `onDismiss` closes; a provider that isn't connected shows its connect state.
 */
export const FlowProblemNotice = ({
  problem,
  onDismiss,
}: {
  problem: FlowProblem;
  onDismiss?: () => void;
}) => {
  const t = useTranslations("Wizard.problem");
  const provider = providerOf(problem);
  // fal while wovain draws the art: nothing for the merchant to connect.
  const connectable = useConnectable(provider ?? "fourthwall");

  if (provider !== undefined && connectable) {
    return (
      <ConnectState
        provider={provider}
        reconnect={
          problem.kind === "not_connected" && problem.reconnect === true
        }
      />
    );
  }

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
  if (problem.kind === "not_configured" || problem.kind === "not_connected") {
    // Server set-up is wovain's job: the designer sees no vendor or variable
    // names. So is a connection wovain holds itself (its own fal key).
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
