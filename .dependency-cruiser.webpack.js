// Minimal, unused-at-runtime webpack config consumed only by
// dependency-cruiser (via options.webpackConfig) so it can resolve
// apps/web's "@/*" tsconfig path alias the same way Next.js does, without
// depending on dependency-cruiser's separate (and monorepo-unfriendly)
// tsConfig project-loading path. See .dependency-cruiser.js.
const path = require("node:path");

module.exports = {
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "apps/web"),
    },
  },
};
