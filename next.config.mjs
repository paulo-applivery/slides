/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    if (isServer) {
      // bottleneck (transitive via @hubspot/api-client) has opt-in
      // redis-backed clustering with bare require("redis") / require("ioredis")
      // calls. We don't use clustering, so drop the imports so OpenNext's
      // worker bundle step doesn't fail to resolve them.
      config.resolve.alias = {
        ...config.resolve.alias,
        ioredis: false,
        redis: false,
      };
    }
    return config;
  },
};

export default nextConfig;
