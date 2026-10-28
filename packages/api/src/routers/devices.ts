import { z } from "zod";

import {
  inboxOf,
  registerDevice,
  requireMobileApp,
  unregisterDevice,
} from "../flow/devices";
import { protectedProcedure } from "../index";

// The mobile app's own procedures (openspec mobile-app), behind the
// mobile-app flag: its push token, and the inbox it opens on. Everything
// else it shows comes from the website's procedures.

// An Expo push token: ExponentPushToken[…] or ExpoPushToken[…].
const token = z
  .string()
  .trim()
  .max(200)
  .regex(/^Expo(?:nent)?PushToken\[.+\]$/u);

export const devicesRouter = {
  register: protectedProcedure
    .input(z.object({ platform: z.enum(["ios", "android", "web"]), token }))
    .handler(async ({ context, input }) => {
      await requireMobileApp(context);
      return await registerDevice(context, input);
    }),
  unregister: protectedProcedure
    .input(z.object({ token }))
    .handler(async ({ context, input }) => {
      await requireMobileApp(context);
      return await unregisterDevice(context, input.token);
    }),
};

export const inboxRouter = {
  list: protectedProcedure.handler(async ({ context }) => {
    await requireMobileApp(context);
    return await inboxOf(context);
  }),
};
