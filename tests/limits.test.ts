import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/api/app.js";
import { FixtureProvider } from "../src/provider/fixture-provider.js";
import { buildProvider } from "../src/provider/index.js";

describe("Rate limiting", () => {
  it("returns 429 after exceeding the configured max", async () => {
    const app = createApp({
      provider: new FixtureProvider(),
      enableRateLimit: true,
      rateLimitMax: 3,
      rateLimitWindowMs: 60000,
    });
    // First 3 requests pass; the 4th should be throttled.
    const codes: number[] = [];
    for (let i = 0; i < 4; i++) {
      const res = await request(app).get("/api/v1/health");
      codes.push(res.status);
    }
    expect(codes[3]).toBe(429);
  });
});

describe("Provider factory", () => {
  it("returns the fixture provider by default", () => {
    const prev = process.env.MEDEX_PROVIDER;
    delete process.env.MEDEX_PROVIDER;
    const p = buildProvider();
    expect(p.name).toBe("fixture");
    expect(p.isLive).toBe(false);
    if (prev !== undefined) process.env.MEDEX_PROVIDER = prev;
  });

  it("explicitly rejects MEDEX_PROVIDER=live (no authorized source)", () => {
    process.env.MEDEX_PROVIDER = "live";
    expect(() => buildProvider()).toThrow(/not supported yet|DATA_SOURCES/i);
    delete process.env.MEDEX_PROVIDER;
  });

  it("rejects an unknown provider value", () => {
    process.env.MEDEX_PROVIDER = "bogus";
    expect(() => buildProvider()).toThrow(/Unknown MEDEX_PROVIDER/i);
    delete process.env.MEDEX_PROVIDER;
  });
});

describe("CORS", () => {
  it("allows a configured origin via preflight", async () => {
    const app = createApp({
      provider: new FixtureProvider(),
      enableRateLimit: false,
      corsOrigin: "https://example.com",
    });
    const res = await request(app)
      .options("/api/v1/health")
      .set("Origin", "https://example.com")
      .set("Access-Control-Request-Method", "GET");
    expect(res.status).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe("https://example.com");
  });
});
