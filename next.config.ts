import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Enables forbidden() and app/forbidden.tsx for the "not allowed" page (US-1.8, D10).
    authInterrupts: true,
    // Logo uploads (1 MB, LOGO_MAX_BYTES) and import files (5 MB,
    // IMPORT_MAX_BYTES) go through server actions, plus room for the
    // multipart overhead.
    serverActions: { bodySizeLimit: "6mb" },
  },
};

export default nextConfig;
