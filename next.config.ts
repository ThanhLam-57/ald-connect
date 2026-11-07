import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: process.env.NEXT_PUBLIC_CONNECT_BASE_PATH || undefined,
  devIndicators: false,
  logging: {
    incomingRequests: { ignore: [/\/(?:kich-hoat|dat-lai-mat-khau)(?:[/?]|$)/] },
  },
  async headers() {
    return [{ source: "/:path*", headers: [{ key: "Referrer-Policy", value: "no-referrer" }] }];
  },
};

export default nextConfig;
