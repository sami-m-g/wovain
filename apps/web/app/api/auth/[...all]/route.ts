import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "../../../../lib/server.ts";

// Sign-in, the OAuth endpoints ChatGPT calls, and their metadata.
export const { GET, POST } = toNextJsHandler(auth);
