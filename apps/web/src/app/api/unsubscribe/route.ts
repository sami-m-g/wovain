import { emailOptOut } from "@wovain/db/schema/seller";
import { pickLocale } from "@wovain/email/emails";
import { verifyUnsubscribeToken } from "@wovain/email/unsubscribe";
import { unsubscribePage } from "@wovain/email/unsubscribe-page";
import type { UnsubscribeView } from "@wovain/email/unsubscribe-page";

import { ENV } from "@/env.server";
import { withEvlog } from "@/lib/evlog";
import { db } from "@/services";

// The one-click unsubscribe of wovain's non-essential email (run updates),
// RFC 8058: a mail client POSTs `List-Unsubscribe=One-Click` to the link in
// the List-Unsubscribe header. A person who opens the link gets a page with a
// button (GET changes nothing, so a link scanner can't unsubscribe anyone).
// Verification and reset email is essential and has no such link.

const BAD_REQUEST = 400;
const OK = 200;

const page = async (request: Request, state: UnsubscribeView) =>
  new Response(
    await unsubscribePage(
      pickLocale(request.headers.get("accept-language")),
      state
    ),
    {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Type": "text/html; charset=utf-8",
      },
      status: state.view === "invalid" ? BAD_REQUEST : OK,
    }
  );

const addressOf = (request: Request) => {
  const token = new URL(request.url).searchParams.get("token");
  return token === null
    ? undefined
    : verifyUnsubscribeToken(ENV.BETTER_AUTH_SECRET, token);
};

const handleGet = (request: Request) => {
  if (addressOf(request) === undefined) {
    return page(request, { view: "invalid" });
  }
  const { search } = new URL(request.url);
  return page(request, {
    action: `/api/unsubscribe${search}`,
    view: "confirm",
  });
};

const handlePost = async (request: Request) => {
  const email = addressOf(request);
  if (email === undefined) {
    return page(request, { view: "invalid" });
  }
  await db.insert(emailOptOut).values({ email }).onConflictDoNothing();
  return page(request, { view: "done" });
};

export const GET = withEvlog(handleGet);
export const POST = withEvlog(handlePost);
