#!/usr/bin/env node
import { startStdio } from "./server.js";

startStdio().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[medex-mcp] failed to start:", err);
  process.exit(1);
});
