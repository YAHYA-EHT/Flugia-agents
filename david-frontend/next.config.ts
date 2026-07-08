import type { NextConfig } from "next";

// Backend is reached SERVER-SIDE by Next (both run on the same host), so plain
// localhost works here regardless of which IP a teammate used to open the app.
const BACKEND_URL = process.env.ARIA_BACKEND_URL ?? "http://localhost:8000";

const nextConfig: NextConfig = {
  reactCompiler: true,

  // Same-origin API proxy. The browser calls /v1/* on whatever host:port it
  // loaded the app from; Next forwards it to the backend. This keeps the API
  // origin-independent (any teammate IP / VPN works) and sidesteps CORS — the
  // browser never makes a cross-origin request. See lib/aria/config.ts.
  async rewrites() {
    return [{ source: "/v1/:path*", destination: `${BACKEND_URL}/v1/:path*` }];
  },

  // Dev-only: let the dev server accept requests when teammates open it via the
  // host's LAN IPs (Next 16 blocks unknown cross-origin dev origins otherwise).
  // Harmless in production (`next start` ignores it).
  allowedDevOrigins: ["192.168.80.194", "192.168.80.140"],
};

export default nextConfig;
