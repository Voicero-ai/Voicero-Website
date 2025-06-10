/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  serverExternalPackages: ["sharp"],

  images: {
    domains: ["i.postimg.cc"],
    dangerouslyAllowSVG: true,
    remotePatterns: [],
    unoptimized: true,
  },

  experimental: {
    serverActions: { bodySizeLimit: "10mb" },
  },

  // Global response headers (runs on every build)
  async headers() {
    return [
      {
        source: "/api/:path*", // every API route
        headers: [
          { key: "Connection", value: "keep-alive" }
        ],
      },
    ];
  },

  webpack(config) {
    config.module.rules.push({
      test: /\.svg$/,
      use: ["@svgr/webpack"],
    });
    return config;
  },
};

module.exports = nextConfig;
