const withPWA = require("next-pwa")({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",
  // Next lists this in the build manifest but never serves it; precaching
  // the 404 makes the whole service worker install fail.
  buildExcludes: [/dynamic-css-manifest\.json$/],
});

module.exports = withPWA({
  reactStrictMode: true,
  // Don't let `next dev` generate an AGENTS.md in the repo root.
  agentRules: false,
  transpilePackages: ['@noteboard/shared'],
});
