import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "localhost:3000",
    "192.168.0.27:3000",
    "192.168.0.27",
    "100.75.225.52:3000",
    "100.75.225.52:3001",
    "100.75.225.52",
    "localhost:3001",
    "localhost:3002",
  ],
  experimental: {
    serverActions: {
      allowedOrigins: [
        "100.75.225.52:3000",
        "100.75.225.52:3001",
        "localhost:3000",
        "localhost:3001",
        "localhost:3002",
        "192.168.0.27:3000",
      ],
    },
  },
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
