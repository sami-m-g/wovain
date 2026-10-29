import type { Preview } from "@storybook/nextjs-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { mswLoader } from "msw-storybook-addon/csf3";
import { NextIntlClientProvider } from "next-intl";

import messages from "../messages/en.json";
import { BRAND_CSS } from "../src/brand/brand";
import { rpcNotFound } from "./rpc";

import "../src/index.css";

const preview: Preview = {
  // A story answers its own procedures with rpc() (./rpc.ts); the rest 404.
  beforeEach: ({ msw }) => {
    msw.use(rpcNotFound);
  },
  decorators: [
    (Story) => (
      // A fresh cache per story, so one story's data never leaks into the next.
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
          <style>{BRAND_CSS}</style>
          <Story />
        </NextIntlClientProvider>
      </QueryClientProvider>
    ),
  ],
  loaders: [mswLoader()],
  parameters: {
    // Accessibility violations fail the component tests.
    a11y: { test: "error" },
    nextjs: { appDirectory: true },
  },
};

export default preview;
