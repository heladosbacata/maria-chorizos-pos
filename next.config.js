/** @type {import('next').NextConfig} */
const posBuildId =
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.VERCEL_DEPLOYMENT_ID ||
  process.env.POS_BUILD_ID ||
  `dev-${Date.now()}`;

const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_POS_BUILD_ID: posBuildId,
  },
  experimental: {
    optimizePackageImports: ["lucide-react", "firebase/app", "firebase/auth", "firebase/firestore"],
  },
  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 60 * 60 * 24 * 7,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
      {
        protocol: "http",
        hostname: "**",
      },
    ],
  },
};

module.exports = nextConfig;
