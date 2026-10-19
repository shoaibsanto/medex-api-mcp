#!/usr/bin/env node
import { createApp } from "./api/app.js";
import { buildProvider } from "./provider/index.js";
import { loadConfig, VERSION } from "./config.js";

function main(): void {
  const cfg = loadConfig();

  let provider;
  try {
    provider = buildProvider();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[medex-api] failed to build provider: ${(err as Error).message}`);
    process.exit(1);
  }

  const app = createApp({
    provider,
    corsOrigin: cfg.corsOrigin,
    rateLimitMax: cfg.rateLimitMax,
    rateLimitWindowMs: cfg.rateLimitWindowMs,
  });

  const server = app.listen(cfg.port, cfg.host, () => {
    // eslint-disable-next-line no-console
    console.log(
      `[medex-api] v${VERSION} listening on http://${cfg.host}:${cfg.port} ` +
        `(provider=${provider.name}, live=${provider.isLive})`,
    );
  });

  // Graceful shutdown.
  const shutdown = (): void => {
    server.close(() => process.exit(0));
    // Force-exit if close hangs.
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main();
