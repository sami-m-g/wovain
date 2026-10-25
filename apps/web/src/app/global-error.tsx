"use client";

import "@/index.css";
import { BRAND_CSS } from "@/brand/brand";

import messages from "../../messages/en.json";

// Last-resort boundary when the locale layout itself fails, so it falls back to English.
const GlobalError = ({ reset }: { error: Error; reset: () => void }) => (
  <html lang="en">
    <head>
      <style>{BRAND_CSS}</style>
    </head>
    <body className="bg-background text-foreground grid min-h-svh place-items-center p-6 font-sans">
      <main className="max-w-md text-center">
        <h1 className="font-display text-3xl font-semibold tracking-[-0.03em]">
          {messages.Error.title}
        </h1>
        <p className="text-muted-foreground mt-3">{messages.Error.body}</p>
        <button
          className="bg-primary text-primary-foreground mt-6 h-10 rounded-lg px-4 font-medium"
          onClick={reset}
          type="button"
        >
          {messages.Error.retry}
        </button>
      </main>
    </body>
  </html>
);

export default GlobalError;
