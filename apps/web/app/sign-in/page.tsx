import type { Metadata } from "next";

import { loadAuthEnv } from "../../lib/env.ts";
import { GoogleButton } from "./google-button.tsx";

export const metadata: Metadata = { title: "Sign in · wovain" };

const env = loadAuthEnv();
const googleReady =
  env.GOOGLE_CLIENT_ID !== undefined && env.GOOGLE_CLIENT_SECRET !== undefined;

// ChatGPT opens this page when it connects to wovain the first time.
const SignIn = () => (
  <main className="panel">
    <h1>Sign in to wovain</h1>
    <p>
      Your designs, ads and settings stay with your account, so any chat picks
      up where you left off.
    </p>
    {googleReady ? (
      <GoogleButton />
    ) : (
      <p role="alert">Sign-in isn’t set up on this server yet.</p>
    )}
  </main>
);

export default SignIn;
