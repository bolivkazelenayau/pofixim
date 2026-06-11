import type { NextConfig } from "next";

const extraAllowedOrigins = (process.env.NEXT_EXTRA_ALLOWED_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const allowedOrigins = [
  "localhost:3000",
  "localhost:3001",
  "localhost:3002",
  "localhost:3003",
  "192.168.0.27",
  "192.168.0.27:3000",
  "192.168.0.27:3001",
  "192.168.0.27:3002",
  "192.168.0.27:3003",
  "100.75.225.52",
  "100.75.225.52:3000",
  "100.75.225.52:3001",
  "100.75.225.52:3003",
  ...extraAllowedOrigins,
];

const nextConfig: NextConfig = {
  allowedDevOrigins: allowedOrigins,
  experimental: {
    serverActions: {
      allowedOrigins,
    },
  },
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
