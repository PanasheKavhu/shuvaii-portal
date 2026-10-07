import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Enables forbidden() and app/forbidden.tsx for the "not allowed" page (US-1.8, D10).
    authInterrupts: true,
    // Logo uploads go through a server action; the logo itself is capped at
    // 1 MB (LOGO_MAX_BYTES), plus room for the multipart overhead.
    serverActions: { bodySizeLimit: "2mb" },
  },
};

export default nextConfig;
