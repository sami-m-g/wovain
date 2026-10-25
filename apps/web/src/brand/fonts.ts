import { Familjen_Grotesk, Geist, Geist_Mono } from "next/font/google";

/** Display voice: headlines and the wordmark. */
const display = Familjen_Grotesk({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-familjen",
});

/** UI and reading text, with tabular figures for money and scores. */
const sans = Geist({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-geist",
});

/** Codes and the spec lines on a hang tag. Not preloaded: it is small print. */
const mono = Geist_Mono({
  display: "swap",
  preload: false,
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

export const fontVariables = `${display.variable} ${sans.variable} ${mono.variable}`;
