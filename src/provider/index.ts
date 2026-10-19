import type { Provider } from "./provider.js";
import { FixtureProvider } from "./fixture-provider.js";
import { LiveProvider } from "./live-provider.js";

/**
 * buildProvider returns the configured data provider.
 *
 * Default: the live browser provider, which navigates medex.com.bd on demand.
 * MEDEX_PROVIDER=fixture selects the synthetic development fixtures — this is
 * an explicit, opt-in development/testing mode and must never back production
 * traffic. Any other value throws, so a typo can never silently fall back to
 * fixtures.
 */
export function buildProvider(): Provider {
  const kind = (process.env.MEDEX_PROVIDER ?? "live").toLowerCase();

  switch (kind) {
    case "live":
      return new LiveProvider();
    case "fixture":
      return new FixtureProvider();
    default:
      throw new Error(`Unknown MEDEX_PROVIDER value: "${kind}". Use "live" or "fixture".`);
  }
}

export type { Provider } from "./provider.js";
export { FixtureProvider } from "./fixture-provider.js";
export { LiveProvider } from "./live-provider.js";
