import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import "@/index.css";
import "@/lib/orpc.server";
import Header from "@/components/header";
import Providers from "@/components/providers";

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  description: "wovain",
  title: "wovain",
};

const RootLayout = ({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) => (
  <html lang="en" suppressHydrationWarning>
    <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
      <Providers>
        <div className="grid h-svh grid-rows-[auto_1fr]">
          <Header />
          {children}
        </div>
      </Providers>
    </body>
  </html>
);

export default RootLayout;
