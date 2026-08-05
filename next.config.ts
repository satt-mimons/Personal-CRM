import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Voice notes POST audio to a Server Action, and the default cap is 1MB.
      // The recorder caps a clip at 3 minutes of 24kbps mono (~540KB), so this
      // leaves headroom while staying under Vercel's hard 4.5MB body limit.
      // Requests also pass through middleware, whose own limit
      // (experimental.middlewareClientMaxBodySize) already defaults to 10MB.
      bodySizeLimit: "5mb",
    },
  },
};

export default nextConfig;
