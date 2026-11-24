import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Playwright / scraper runs in Node route handlers
  serverExternalPackages: ["playwright"],
};

export default nextConfig;
