import {
  environmentManager,
  QueryCache,
  QueryClient,
} from "@tanstack/react-query";

// The app's query client, apart from the oRPC client so public pages can
// mount the provider without shipping the API client.
const createQueryClient = () =>
  new QueryClient({
    queryCache: new QueryCache({
      onError: async (error, query) => {
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
