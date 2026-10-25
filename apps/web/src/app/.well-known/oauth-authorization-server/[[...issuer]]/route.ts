import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "@/services";

// RFC 8414 metadata at the root, path-inserted for the /api/auth issuer.
export const { GET } = toNextJsHandler(auth);
