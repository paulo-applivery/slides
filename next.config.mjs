/**
 * Strips `eval("require")("ioredis"|"redis")` patterns from emitted JS chunks.
 *
 * Bottleneck (transitive via @hubspot/api-client) uses `eval("require")` to
 * hide its optional redis-clustering imports from webpack. That trick fools
 * webpack but not esbuild, which OpenNext uses to bundle the worker — esbuild
 * still resolves the string and fails with "Could not resolve 'ioredis'".
 *
 * Replacing the expression with `null` is safe: the path only fires when
 * Bottleneck's `datastore: "redis"` option is set, which we don't use.
 */
class StripBottleneckRedisRequiresPlugin {
  apply(compiler) {
    const PLUGIN = "StripBottleneckRedisRequires";
    compiler.hooks.compilation.tap(PLUGIN, (compilation) => {
      compilation.hooks.processAssets.tap(
        { name: PLUGIN, stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_OPTIMIZE },
        (assets) => {
          for (const name of Object.keys(assets)) {
            if (!name.endsWith(".js")) continue;
            const src = assets[name].source();
            if (typeof src !== "string" || !src.includes('eval("require")')) continue;
            const stripped = src
              .replace(/eval\("require"\)\("ioredis"\)/g, "null")
              .replace(/eval\("require"\)\("redis"\)/g, "null");
            if (stripped !== src) {
              assets[name] = new compiler.webpack.sources.RawSource(stripped);
            }
          }
        }
      );
    });
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.plugins.push(new StripBottleneckRedisRequiresPlugin());
    }
    return config;
  },
};

export default nextConfig;
