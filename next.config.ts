import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The report PDF's embedded font (D45), read from disk where reports are
  // rendered: the head's class reports page, whose action makes the PDFs.
  outputFileTracingIncludes: {
    "/head/reports/**": ["src/lib/reports/pdf/fonts/*.ttf"],
  },
  experimental: {
    // Enables forbidden() and app/forbidden.tsx for the "not allowed" page (US-1.8, D10).
    authInterrupts: true,
    // Logo uploads (1 MB, LOGO_MAX_BYTES) and import files (5 MB,
    // IMPORT_MAX_BYTES) go through server actions, plus room for the
    // multipart overhead.
    serverActions: { bodySizeLimit: "6mb" },
    // Styles arrive inside the HTML instead of as a render-blocking file, so
    // a phone on a slow 3G link paints the portal one round trip sooner
    // (SPEC section 5, D47). The whole stylesheet is about 11 KB compressed.
    inlineCss: true,
  },
};

export default nextConfig;
