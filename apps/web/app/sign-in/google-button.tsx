"use client";

import { useState } from "react";

import { authClient } from "../../lib/auth-client.ts";

export const GoogleButton = () => {
  const [failed, setFailed] = useState(false);

  // Inside an OAuth flow the server continues to ChatGPT after Google.
  const signIn = async () => {
    setFailed(false);
    const { error } = await authClient.signIn.social({
      callbackURL: "/",
      provider: "google",
    });
    setFailed(error !== null);
  };

  return (
    <form action={signIn}>
      <button className="primary" type="submit">
        Continue with Google
      </button>
      {failed ? (
        <p role="alert">Google sign-in didn’t start. Try again.</p>
      ) : null}
    </form>
  );
};
