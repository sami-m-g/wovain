import type { ReactNode } from "react";

// The <html> element lives in `[locale]/layout.tsx` so it carries the locale.
const RootLayout = ({ children }: { children: ReactNode }) => children;

export default RootLayout;
