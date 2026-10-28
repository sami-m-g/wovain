// Varlock's Babel plugin inlines the app's public env (.env.schema) at build
// time: ENV.EXPO_PUBLIC_API_URL becomes its value.
const varlock = require("@varlock/expo-integration/babel-plugin");
// Hermes can't compile a destructured rest parameter with defaults
// (`...[input, options = {}]`), which @orpc/client ships; this rewrites
// parameters to plain ES5 before Hermes sees them.
const parameters = require("@babel/plugin-transform-parameters");

const babelConfig = (api) => {
  api.cache(true);
  return {
    plugins: [varlock, parameters],
    presets: ["babel-preset-expo"],
  };
};

module.exports = babelConfig;
