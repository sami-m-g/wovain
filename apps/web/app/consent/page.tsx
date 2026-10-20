import { verifyOAuthQueryParams } from "@better-auth/oauth-provider";
import type { Metadata } from "next";
import { headers } from "next/headers";

import { auth } from "../../lib/server.ts";
import { ConsentButtons } from "./consent-buttons.tsx";

export const metadata: Metadata = { title: "Allow access · wovain" };

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const asQuery = (params: Record<string, string | string[] | undefined>) => {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    for (const item of [value].flat()) {
      if (item !== undefined) {
        query.append(key, item);
      }
    }
  }
  return query;
};

// The authorize step sends a signed query here; anything unsigned is refused.
const Consent = async ({ searchParams }: Props) => {
  const query = asQuery(await searchParams);
  const { secret } = await auth.$context;
  const clientId = query.get("client_id");
  if (
    clientId === null ||
    !(await verifyOAuthQueryParams(query.toString(), secret))
  ) {
    return (
      <main className="panel">
        <h1>This link has expired</h1>
        <p>Go back to ChatGPT and connect wovain again.</p>
      </main>
    );
  }
  const client = await auth.api
    .getOAuthClientPublic({
      headers: await headers(),
      query: { client_id: clientId },
    })
    .catch(() => null);
  const name = client?.client_name ?? "This app";
  return (
    <main className="panel">
      <h1>Allow {name} to use wovain?</h1>
      <p>
        It will design products, make ads and run campaigns for your shop
        through wovain, as you ask in chat.
      </p>
      <ConsentButtons />
    </main>
  );
};

export default Consent;
