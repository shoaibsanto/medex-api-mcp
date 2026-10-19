/** Central configuration, read once from the environment. */

export const VERSION = "0.1.0";

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

export interface Config {
  port: number;
  host: string;
  providerKind: string;
  corsOrigin: string | string[];
  rateLimitMax: number;
  rateLimitWindowMs: number;
}

export function loadConfig(): Config {
  const rawOrigin = process.env.MEDEX_CORS_ORIGIN ?? "*";
  return {
    port: intEnv("PORT", 3000),
    host: process.env.HOST ?? "127.0.0.1",
    providerKind: (process.env.MEDEX_PROVIDER ?? "live").toLowerCase(),
    corsOrigin: rawOrigin.includes(",")
      ? rawOrigin.split(",").map((s) => s.trim())
      : rawOrigin,
    rateLimitMax: intEnv("MEDEX_RATE_LIMIT_MAX", 100),
    rateLimitWindowMs: intEnv("MEDEX_RATE_LIMIT_WINDOW_MS", 15 * 60 * 1000),
  };
}
