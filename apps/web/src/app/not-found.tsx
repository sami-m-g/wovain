import Link from "next/link";

import "@/index.css";
import messages from "../../messages/en.json";

// Requests outside any locale (rare: the proxy adds one) fall back to English.
// Localized 404s live in `[locale]/not-found.tsx`.
const GlobalNotFound = () => (
  <html lang="en">
    <body className="bg-background text-foreground grid min-h-svh place-items-center p-6 font-sans">
      <main className="max-w-md text-center">
        <h1 className="text-3xl font-black">{messages.NotFound.title}</h1>
        <p className="text-muted-foreground mt-3">{messages.NotFound.body}</p>
        <Link
          className="text-primary mt-6 inline-block font-semibold underline"
          href={{ pathname: "/" }}
        >
          {messages.NotFound.home}
        </Link>
      </main>
    </body>
  </html>
);

export default GlobalNotFound;
