import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: process.env.NEXT_PUBLIC_CONNECT_BASE_PATH || undefined,
  devIndicators: false,
  logging: {
    incomingRequests: { ignore: [/\/(?:kich-hoat|dat-lai-mat-khau)(?:[/?]|$)/] },
  },
  async headers() {
    // Native form submissions need their origin; activation and reset paths stay out of referrers.
    return [{ source: "/:path*", headers: [{ key: "Referrer-Policy", value: "strict-origin" }] }];
  },
};

export default nextConfig;
