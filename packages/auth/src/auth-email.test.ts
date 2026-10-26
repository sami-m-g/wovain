import { createTestDb } from "@wovain/billing/testing";
import type { Database } from "@wovain/db";
import { user } from "@wovain/db/schema/auth";
import type { Mailer } from "@wovain/email/mailer";
import type { GenericEndpointContext } from "better-auth";
import { eq } from "drizzle-orm";
import { log } from "evlog";
import { UnsecuredJWT } from "jose";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";

import { createAuth, verifyEmailFromGoogle } from "./index";

// The sign-up's verification email on PGlite, through Better Auth's own
// handler, and the Google account that proves an unverified email.

const URL_BASE = "http://localhost:3001";
const EMAIL = "merchant@example.com";

let db: Database;
let close: () => Promise<void>;
let reset: () => Promise<void>;
const mailer = vi.fn<Mailer>();
const capture = vi.fn(async () => {});
const captureException = vi.fn(async () => {});

const makeAuth = () =>
  createAuth(
    {
      BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret-32",
      BETTER_AUTH_URL: URL_BASE,
    },
    db,
    mailer,
    { capture, captureException }
  );

beforeAll(async () => {
  ({ close, db, reset } = await createTestDb());
});

beforeEach(async () => {
  await reset();
  mailer.mockReset();
  captureException.mockClear();
  vi.restoreAllMocks();
});

afterAll(async () => {
  await close();
});

const signUp = async (auth: ReturnType<typeof makeAuth>) =>
  await auth.handler(
    new Request(`${URL_BASE}/api/auth/sign-up/email`, {
      body: JSON.stringify({
        email: EMAIL,
        name: "Merchant",
        password: "a-long-password-1",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    })
  );

const userRow = async () => {
  const [row] = await db.select().from(user).where(eq(user.email, EMAIL));
  if (row === undefined) {
    throw new Error("The sign-up created no user");
  }
  return row;
};

const isVerified = async () => {
  const { emailVerified } = await userRow();
  return emailVerified;
};

it("sends the verification email before the sign-up answers", async () => {
  mailer.mockResolvedValue();

  const response = await signUp(makeAuth());

  expect(response.status).toBe(200);
  expect(mailer).toHaveBeenCalledOnce();
  expect(mailer).toHaveBeenCalledWith(
    expect.objectContaining({
      message: expect.objectContaining({ kind: "verify" }),
      to: EMAIL,
    })
  );
});

it("logs and captures a failed verification email, and still signs up", async () => {
  const error = vi.spyOn(log, "error").mockImplementation(() => {});
  const refused = new Error("The wovain.com domain is not verified");
  mailer.mockRejectedValue(refused);

  const response = await signUp(makeAuth());

  expect(response.status).toBe(200);
  const { id } = await userRow();
  expect(error).toHaveBeenCalledWith(
    expect.objectContaining({ email: { kind: "verify" }, userId: id })
  );
  expect(captureException).toHaveBeenCalledWith(refused, {
    distinctId: id,
    properties: { emailKind: "verify", source: "auth-email" },
  });
});

it("still signs up when capturing the failed email fails too", async () => {
  vi.spyOn(log, "error").mockImplementation(() => {});
  const warn = vi.spyOn(log, "warn").mockImplementation(() => {});
  mailer.mockRejectedValue(new Error("The wovain.com domain is not verified"));
  captureException.mockRejectedValueOnce(new Error("PostHog is unreachable"));

  const response = await signUp(makeAuth());

  expect(response.status).toBe(200);
  expect(warn).toHaveBeenCalledOnce();
});

// Cloud Run hands the app requests on its own listen address; the link must
// still point at the public origin.
const INTERNAL_ORIGIN = "http://0.0.0.0:8080";

const post = async (
  auth: ReturnType<typeof makeAuth>,
  path: string,
  body: Record<string, unknown>,
  origin = URL_BASE
) =>
  await auth.handler(
    new Request(`${origin}/api/auth${path}`, {
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
      method: "POST",
    })
  );

const signUpForDashboard = async (
  auth: ReturnType<typeof makeAuth>,
  origin = URL_BASE
) =>
  await post(
    auth,
    "/sign-up/email",
    {
      callbackURL: "/dashboard",
      email: EMAIL,
      name: "Merchant",
      password: "a-long-password-1",
    },
    origin
  );

// As the sign-in form sends it: without a callback URL.
const signIn = async (auth: ReturnType<typeof makeAuth>) =>
  await post(auth, "/sign-in/email", {
    email: EMAIL,
    password: "a-long-password-1",
  });

// The link in the last email sent.
const sentLink = () => {
  const mail = mailer.mock.lastCall?.[0];
  if (mail === undefined || !("url" in mail.message)) {
    throw new Error("No email with a link was sent");
  }
  return new URL(mail.message.url);
};

const SESSION_COOKIE = /better-auth\.session_token=[^;]+/u;

it("answers an email sign-up without a session, and emails a public link", async () => {
  mailer.mockResolvedValue();

  const response = await signUpForDashboard(makeAuth(), INTERNAL_ORIGIN);

  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ token: null });
  expect(response.headers.get("set-cookie") ?? "").not.toMatch(SESSION_COOKIE);
  const link = sentLink();
  expect(`${link.origin}${link.pathname}`).toBe(
    `${URL_BASE}/api/auth/verify-email`
  );
  expect(link.searchParams.get("callbackURL")).toBe("/dashboard");
  expect(await isVerified()).toBe(false);
});

it("refuses a password sign-in until the email is verified, and sends a new link", async () => {
  mailer.mockResolvedValue();
  const auth = makeAuth();
  await signUpForDashboard(auth);
  mailer.mockClear();

  const response = await signIn(auth);

  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({ code: "EMAIL_NOT_VERIFIED" });
  expect(mailer).toHaveBeenCalledOnce();
  const link = sentLink();
  expect(link.pathname).toBe("/api/auth/verify-email");
  expect(link.searchParams.get("callbackURL")).toBe("/dashboard");
});

it("verifies the email and signs the merchant in from the link, landing on /dashboard", async () => {
  mailer.mockResolvedValue();
  const auth = makeAuth();
  await signUpForDashboard(auth);

  const response = await auth.handler(new Request(sentLink()));

  expect(response.status).toBe(302);
  expect(response.headers.get("location")).toBe("/dashboard");
  expect(response.headers.get("set-cookie") ?? "").toMatch(SESSION_COOKIE);
  expect(await isVerified()).toBe(true);
  const signedIn = await signIn(auth);
  expect(signedIn.status).toBe(200);
});

it("answers a sign-up with a taken email like a new one", async () => {
  mailer.mockResolvedValue();
  const auth = makeAuth();
  const first = await signUpForDashboard(auth);
  const again = await signUpForDashboard(auth);

  expect(again.status).toBe(first.status);
  expect(await again.json()).toMatchObject({ token: null });
});

const googleIdToken = (claims: Record<string, unknown>) =>
  new UnsecuredJWT(claims).encode();

const linkGoogle = async (
  auth: ReturnType<typeof makeAuth>,
  userId: string,
  claims: Record<string, unknown>
) => {
  const context = await auth.$context;
  await verifyEmailFromGoogle(
    { idToken: googleIdToken(claims), providerId: "google", userId },
    { context } as unknown as GenericEndpointContext
  );
};

it("verifies the email when Google verified the same address", async () => {
  mailer.mockResolvedValue();
  const auth = makeAuth();
  await signUp(auth);
  const { id } = await userRow();
  expect(await isVerified()).toBe(false);

  await linkGoogle(auth, id, {
    email: "Merchant@Example.com",
    email_verified: true,
  });

  expect(await isVerified()).toBe(true);
});

it("leaves the email unverified without Google's verified claim for it", async () => {
  mailer.mockResolvedValue();
  const auth = makeAuth();
  await signUp(auth);
  const { id } = await userRow();

  await linkGoogle(auth, id, { email: EMAIL, email_verified: false });
  await linkGoogle(auth, id, {
    email: "someone-else@example.com",
    email_verified: true,
  });
  const context = await auth.$context;
  await verifyEmailFromGoogle(
    { idToken: "not-a-jwt", providerId: "google", userId: id },
    { context } as unknown as GenericEndpointContext
  );

  expect(await isVerified()).toBe(false);
});
