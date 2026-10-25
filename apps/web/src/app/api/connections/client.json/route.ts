import { clientMetadata, clientMetadataUrl } from "@wovain/core/upstream";

import { ENV } from "@/env.server";

// wovain's OAuth Client ID Metadata Document: providers that support it
// (Fourthwall) read wovain's identity from this URL, its client_id.
export const GET = () =>
  Response.json(
    {
      ...clientMetadata(ENV.BETTER_AUTH_URL),
      client_id: clientMetadataUrl(ENV.BETTER_AUTH_URL),
    },
    { headers: { "Cache-Control": "public, max-age=3600" } }
  );
