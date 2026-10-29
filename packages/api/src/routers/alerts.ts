import { alertSettingsSchema } from "@wovain/core/alerts";
import {
  alertChannelsFor,
  alertSettingsFor,
  connectTelegram,
  disconnectTelegram,
  isAlertsOn,
  requireAlerts,
  saveAlertSettings,
} from "@wovain/mastra/flow/alerts";
import { registerDevice, unregisterDevice } from "@wovain/mastra/flow/push";
import { z } from "zod";

import { protectedProcedure } from "../index";

// Settings > Alerts (openspec alerts): which channels each alert type uses,
// quiet hours, and the Telegram and phone links. Behind the alerts flag.

// An Expo push token: ExponentPushToken[…] or ExpoPushToken[…].
const pushToken = z
  .string()
  .trim()
  .max(200)
  .regex(/^Expo(?:nent)?PushToken\[.+\]$/u);

export const alertsRouter = {
  connectTelegram: protectedProcedure.handler(async ({ context }) => {
    await requireAlerts(context);
    return await connectTelegram(context);
  }),
  disconnectTelegram: protectedProcedure.handler(async ({ context }) => {
    await requireAlerts(context);
    return await disconnectTelegram(context);
  }),
  save: protectedProcedure
    .input(alertSettingsSchema)
    .handler(async ({ context, input }) => {
      await requireAlerts(context);
      return await saveAlertSettings(context, input);
    }),
  settings: protectedProcedure.handler(async ({ context }) => {
    if (!(await isAlertsOn(context))) {
      return { on: false as const };
    }
    const [settings, channels] = await Promise.all([
      alertSettingsFor(context),
      alertChannelsFor(context),
    ]);
    return { channels, on: true as const, settings };
  }),
};

// The phone's push token, as the Expo app (#86) saves it.
export const devicesRouter = {
  register: protectedProcedure
    .input(
      z.object({
        platform: z.enum(["ios", "android", "web"]),
        token: pushToken,
      })
    )
    .handler(async ({ context, input }) => {
      await requireAlerts(context);
      return await registerDevice(context, input);
    }),
  unregister: protectedProcedure
    .input(z.object({ token: pushToken }))
    .handler(async ({ context, input }) => {
      await requireAlerts(context);
      return await unregisterDevice(context, input.token);
    }),
};
