"use client";

import { Button } from "@wovain/ui/components/button";
import { useState } from "react";
import { toast } from "sonner";

import { authClient } from "@/lib/auth-client";

// Where Better Auth's OAuth provider sends the merchant when an app (such as
// ChatGPT) asks to act on their wovain account. The signed query in the URL
// rides along with the answer (oauthProviderClient), and the server checks
// it before redirecting back to the app.
const ConsentPage = () => {
  const [pending, setPending] = useState(false);
  const scopes =
    typeof window === "undefined"
      ? []
      : (new URLSearchParams(window.location.search).get("scope") ?? "")
          .split(" ")
          .filter((scope) => scope !== "");

  const answer = async (accept: boolean) => {
    setPending(true);
    const { data, error } = await authClient.oauth2.consent({ accept });
    if (error !== null) {
      setPending(false);
      toast.error(error.message ?? "Couldn't send your answer");
      return;
    }
    if (typeof data?.url === "string") {
      window.location.assign(data.url);
    }
  };

  return (
    <main className="mx-auto mt-10 w-full max-w-md space-y-6 p-6">
      <h1 className="text-2xl font-bold">Allow access to wovain?</h1>
      <p className="text-muted-foreground">
        An app wants to research trends, create designs and products, and stage
        paused campaigns for you.
      </p>
      {scopes.length > 0 && (
        <ul className="list-inside list-disc text-sm">
          {scopes.map((scope) => (
            <li key={scope}>{scope}</li>
          ))}
        </ul>
      )}
      <div className="flex gap-3">
        <Button disabled={pending} onClick={() => answer(true)}>
          Allow
        </Button>
        <Button
          disabled={pending}
          onClick={() => answer(false)}
          variant="outline"
        >
          Deny
        </Button>
      </div>
    </main>
  );
};

export default ConsentPage;
