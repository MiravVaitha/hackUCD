import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every merchant page is per-user and reads live records, so the app renders
  // at request time instead of adopting Cache Components.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // The dev indicator sits over the sidebar's sign-out button.
  devIndicators: false,
};

export default nextConfig;
