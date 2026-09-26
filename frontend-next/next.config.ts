import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Docker image ships Next's self-contained server bundle (see Dockerfile).
  output: process.env.NEXT_OUTPUT_STANDALONE === "1" ? "standalone" : undefined,
};

export default nextConfig;
