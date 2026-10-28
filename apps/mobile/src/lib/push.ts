import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { client } from "./orpc";

// Push notifications (docs.expo.dev/push-notifications/push-notifications-setup):
// ask once, get the Expo push token for wovain's EAS project, and save it
// with devices.register so the server's push-notify function reaches this
// phone.

Notifications.setNotificationHandler({
  handleNotification: () =>
    Promise.resolve({
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
});

export type PushSetup =
  | { status: "registered"; token: string }
  | { status: "denied" }
  | { status: "unsupported"; reason: string };

const projectIdOf = (): string | undefined => {
  const extra: unknown = Constants.expoConfig?.extra;
  const fromExtra =
    typeof extra === "object" &&
    extra !== null &&
    "eas" in extra &&
    typeof extra.eas === "object" &&
    extra.eas !== null &&
    "projectId" in extra.eas &&
    typeof extra.eas.projectId === "string"
      ? extra.eas.projectId
      : undefined;
  return fromExtra ?? Constants.easConfig?.projectId;
};

const platformOf = (): "android" | "ios" | "web" =>
  Platform.OS === "ios" || Platform.OS === "android" ? Platform.OS : "web";

/**
 * Registers this phone for pushes. Simulators without push and builds
 * without an EAS project answer "unsupported" with the reason; a failed
 * registration throws, so the caller shows it.
 */
export const registerForPush = async (): Promise<PushSetup> => {
  if (!Device.isDevice) {
    return { reason: "Push needs a real device", status: "unsupported" };
  }
  const projectId = projectIdOf();
  if (projectId === undefined) {
    return {
      reason: "This build has no EAS project ID (EAS_PROJECT_ID)",
      status: "unsupported",
    };
  }
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      importance: Notifications.AndroidImportance.HIGH,
      name: "wovain",
    });
  }
  const current = await Notifications.getPermissionsAsync();
  const granted = current.granted
    ? current
    : await Notifications.requestPermissionsAsync();
  if (!granted.granted) {
    return { status: "denied" };
  }
  const { data: token } = await Notifications.getExpoPushTokenAsync({
    projectId,
  });
  await client.devices.register({ platform: platformOf(), token });
  return { status: "registered", token };
};

// On sign-out: this phone stops getting the merchant's pushes.
export const unregisterPush = async (token: string) => {
  await client.devices.unregister({ token });
};
