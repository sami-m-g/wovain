// Expo's Metro config (it finds the pnpm workspace on its own), wrapped by
// Varlock so ENV resolves. Package exports stay on: Better Auth needs them.
const { getDefaultConfig } = require("expo/metro-config");
const {
  withVarlockMetroConfig,
} = require("@varlock/expo-integration/metro-config");

module.exports = withVarlockMetroConfig(getDefaultConfig(__dirname));
