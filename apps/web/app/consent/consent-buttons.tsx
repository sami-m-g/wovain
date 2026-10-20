"use client";

import { useState } from "react";

import { authClient } from "../../lib/auth-client.ts";

export const ConsentButtons = () => {
  const [failed, setFailed] = useState(false);

  // After either answer the server returns where ChatGPT is waiting.
  const answer = async (accept: boolean) => {
    setFailed(false);
    const { data, error } = await authClient.oauth2.consent({ accept });
    const next = data?.url;
    if (error === null && typeof next === "string") {
      window.location.assign(next);
      return;
    }
    setFailed(true);
  };

  return (
    <form>
      <div className="actions">
        <button
          className="primary"
          formAction={async () => {
            await answer(true);
          }}
          type="submit"
        >
          Allow
        </button>
        <button
          formAction={async () => {
            await answer(false);
          }}
          type="submit"
        >
          Deny
        </button>
      </div>
      {failed ? (
        <p role="alert">That didn’t go through. Start again from ChatGPT.</p>
      ) : null}
    </form>
  );
};
