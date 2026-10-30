import {
  environmentManager,
  QueryCache,
  QueryClient,
} from "@tanstack/react-query";

// A provider that isn't connected, or whose sign-in expired: expected, and
// the screen shows its connect state instead of an error. Read from the
// code alone, so this file ships without the oRPC client.
const MISSING_CONNECTION = /^[A-Z]+_(?:NOT_CONNECTED|RECONNECT_NEEDED)$/u;
const isMissingConnection = (error: Error) =>
  "code" in error && MISSING_CONNECTION.test(String(error.code));

// The app's query client, apart from the oRPC client so public pages can
// mount the provider without shipping the API client.
const createQueryClient = () =>
  new QueryClient({
    queryCache: new QueryCache({
      onError: async (error, query) => {
        // A query marked quiet only adds detail its screen can do without:
        // its error is logged on the server and the screen shows a dash.
        if (isMissingConnection(error) || query.meta?.quiet === true) {
          return;
        }
        const { toast } = await import("sonner");
        toast.error(`Error: ${error.message}`, {
          action: {
            label: "retry",
            onClick: () => {
              query.invalidate();
            },
          },
        });
      },
    }),
  });

let browserQueryClient: QueryClient | undefined;

export const getQueryClient = () => {
  if (environmentManager.isServer()) {
    return createQueryClient();
  }

  browserQueryClient ??= createQueryClient();
  return browserQueryClient;
};
