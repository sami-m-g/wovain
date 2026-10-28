import { useQuery } from "@tanstack/react-query";

import { authClient } from "./auth-client";
import { queryClient } from "./orpc";
import { registerForPush, unregisterPush } from "./push";
import { identify, reportError } from "./telemetry";

const PUSH_KEY = ["push"] as const;

// This phone's push registration, once per signed-in session. Its error
// (a failed devices.register) is shown on the inbox.
export const usePush = (signedIn: boolean) =>
  useQuery({
    enabled: signedIn,
    queryFn: registerForPush,
    queryKey: PUSH_KEY,
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });

// Signs out: the phone's token goes first, while the session still works.
// A failed unregister (offline, an expired session, the mobile-app flag
// turned off) is reported and never blocks sign-out: the server drops the
// token later, when Expo answers DeviceNotRegistered, or hands it to the
// next merchant who registers this phone.
export const signOut = async () => {
  const push =
    queryClient.getQueryData<Awaited<ReturnType<typeof registerForPush>>>(
      PUSH_KEY
    );
  if (push?.status === "registered") {
    try {
      await unregisterPush(push.token);
    } catch (error) {
      reportError(error, "sign-out: devices.unregister");
    }
  }
  const { error } = await authClient.signOut();
  if (error !== null) {
    throw new Error(error.message ?? "Sign-out failed. Try again.");
  }
  queryClient.clear();
  identify();
};
