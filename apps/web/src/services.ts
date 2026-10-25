import { createAuth } from "@wovain/auth";
import { createCore } from "@wovain/core/core";
import { createDb } from "@wovain/db";

import { ENV } from "./env.server";

export const db = createDb(ENV);
export const auth = createAuth(ENV, db);
export const core = createCore(ENV);
