import { createAuth } from "@wovain/auth";
import { createDb } from "@wovain/db";

import { ENV } from "./env.server";

export const db = createDb(ENV);
export const auth = createAuth(ENV, db);
