"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import dynamic from "next/dynamic";

import { getQueryClient } from "@/utils/query-client";

import { ThemeProvider } from "./theme-provider";

// The dev-only query devtools stay out of production bundles. Toasts mount in
// the app and auth layouts only (components/toaster.tsx).
const ReactQueryDevtools =
  process.env.NODE_ENV === "development"
    ? dynamic(async () => {
        const devtools = await import("@tanstack/react-query-devtools");
        return devtools.ReactQueryDevtools;
      })
    : () => null;

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
