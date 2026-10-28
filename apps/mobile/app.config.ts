import type { ExpoConfig } from "expo/config";

// The wovain mobile app (openspec mobile-app). The EAS project ID comes from
// `eas init` under wovain's Expo account and is set as EAS_PROJECT_ID (an
// EAS environment variable, or .env.local for a local build): push tokens
// are issued for it.
const projectId = process.env["EAS_PROJECT_ID"];

const PAPER = "#f7f1e8";

const config: ExpoConfig = {
  android: {
    adaptiveIcon: {
      backgroundColor: PAPER,
      foregroundImage: "./assets/adaptive-icon.png",
    },
    package: "com.wovain.app",
    permissions: ["RECORD_AUDIO"],
  },
  experiments: { typedRoutes: true },
  icon: "./assets/icon.png",
  ios: {
    bundleIdentifier: "com.wovain.app",
    config: { usesNonExemptEncryption: false },
    infoPlist: {
      // Hold-to-talk (the voice-input workstream) records while the button
      // is held, and only then.
      NSMicrophoneUsageDescription:
        "wovain listens while you hold the mic button, so you can approve and start drops by voice.",
    },
    supportsTablet: false,
  },
  name: "wovain",
  orientation: "portrait",
  owner: process.env["EAS_OWNER"],
  plugins: [
    "expo-router",
    "expo-secure-store",
    ["expo-notifications", { color: "#b0245f" }],
  ],
  // Better Auth returns to wovain:// after a social sign-in
  // (packages/auth trustedOrigins).
  scheme: "wovain",
  slug: "wovain",
  // No over-the-air updates yet: every change ships as a new EAS build.
  updates: { enabled: false },
  version: "0.1.0",
  ...(projectId === undefined ? {} : { extra: { eas: { projectId } } }),
};

export default config;
