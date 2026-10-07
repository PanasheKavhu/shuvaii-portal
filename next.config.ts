import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Enables forbidden() and app/forbidden.tsx for the "not allowed" page (US-1.8, D10).
    authInterrupts: true,
  },
};

export default nextConfig;
