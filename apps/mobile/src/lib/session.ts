import { useQuery } from "@tanstack/react-query";

import { authClient } from "./auth-client";
import { queryClient } from "./orpc";
import { registerForPush, unregisterPush } from "./push";

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
export const signOut = async () => {
  const push =
    queryClient.getQueryData<Awaited<ReturnType<typeof registerForPush>>>(
      PUSH_KEY
    );
  if (push?.status === "registered") {
    await unregisterPush(push.token);
  }
  await authClient.signOut();
  queryClient.clear();
};
