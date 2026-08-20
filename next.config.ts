import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["pg"],
  // Silence Next 16: Turbopack is default; webpack below is only for `dev:docker --webpack`.
  turbopack: {},
  webpack: (config, { dev }) => {
    if (dev && process.env.WATCHPACK_POLLING === "true") {
      config.watchOptions = { poll: 1000, aggregateTimeout: 300 };
    }
    return config;
  },
};

export default nextConfig;
