import type { NextConfig } from "next";
import { resolve } from "node:path";

try {
  process.loadEnvFile(resolve(process.cwd(), "../.env"));
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
