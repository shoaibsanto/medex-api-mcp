import type { Provider } from "./provider.js";
import { FixtureProvider } from "./fixture-provider.js";

/**
 * buildProvider returns the configured data provider.
 *
 * Currently only the synthetic fixture provider is implemented, because no
 * authorized live MedEx feed exists (see DATA_SOURCES.md). The factory is the
 * single place a future authorized LiveProvider would be wired in: set
 * MEDX_PROVIDER=live plus the required credentials, and return the live
 * implementation instead. Routes and the MCP server depend only on the
 * Provider interface, so they need no changes.
 */
export function buildProvider(): Provider {
  const kind = (process.env.MEDEX_PROVIDER ?? "fixture").toLowerCase();

  switch (kind) {
    case "fixture":
      return new FixtureProvider();
    case "live":
      // NOTE: intentionally not implemented. Connecting to a live MedEx feed
      // requires written authorization and an official/ licensed data source.
      // See DATA_SOURCES.md. Throwing here keeps the failure explicit rather
      // than silently serving fixture data as if it were live.
      throw new Error(
        "MEDEX_PROVIDER=live is not supported yet: no authorized live data " +
          "source is configured. See DATA_SOURCES.md. Use MEDEX_PROVIDER=fixture " +
          "(the default) for development.",
      );
    default:
      throw new Error(`Unknown MEDEX_PROVIDER value: "${kind}". Use "fixture".`);
  }
}

export type { Provider } from "./provider.js";
export { FixtureProvider } from "./fixture-provider.js";
