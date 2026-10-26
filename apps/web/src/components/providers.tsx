"use client";

import { QueryClientProvider } from "@tanstack/react-query";
// Renders nothing outside development, where the bundler drops it.
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { ThemeProvider } from "next-themes";

import { getQueryClient } from "@/utils/query-client";

// Toasts mount in the app and auth layouts only (components/toaster.tsx).
const Providers = ({ children }: { children: React.ReactNode }) => {
  const queryClient = getQueryClient();

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <QueryClientProvider client={queryClient}>
        {children}
        <ReactQueryDevtools />
      </QueryClientProvider>
    </ThemeProvider>
  );
};

export default Providers;
