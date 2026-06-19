import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    '10.0.0.250',
    'localhost:3000',
    '*.loca.lt'
  ],
  experimental: {
    serverActions: {
      allowedOrigins: [
        '10.0.0.250:3000',
        'localhost:3000',
        '*.loca.lt'
      ]
    }
  },
  async redirects() {
    return [
      {
        source: '/sticker',
        destination: '/?source=sticker',
        permanent: false,
      },
    ]
  },
};

export default nextConfig;
