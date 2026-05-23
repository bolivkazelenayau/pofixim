import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["localhost:3000", "192.168.0.27:3000", "192.168.0.27"],
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
