import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { createApp } from "../src/api/app.js";
import { FixtureProvider } from "../src/provider/fixture-provider.js";

// Build the app once with rate limiting disabled so tests are not throttled.
let app: Express;
beforeAll(() => {
  app = createApp({ provider: new FixtureProvider(), enableRateLimit: false });
});

describe("Health & readiness", () => {
  it("GET /api/v1/health returns ok + fixture provider info", async () => {
    const res = await request(app).get("/api/v1/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.provider.kind).toBe("fixture");
    expect(res.body.provider.live).toBe(false);
    expect(typeof res.body.version).toBe("string");
  });

  it("GET /api/v1/ready returns ready", async () => {
    const res = await request(app).get("/api/v1/ready");
    expect(res.status).toBe(200);
    expect(res.body.ready).toBe(true);
  });
});

describe("Medicine search & detail", () => {
  it("search returns paginated results", async () => {
    const res = await request(app).get("/api/v1/medicines/search").query({ q: "Paracetamol" });
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.meta.total).toBeGreaterThan(0);
    expect(res.body.source.kind).toBe("fixture");
  });

  it("rejects an empty query with 400 validation_error", async () => {
    const res = await request(app).get("/api/v1/medicines/search").query({ q: "" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("validation_error");
    expect(Array.isArray(res.body.error.details)).toBe(true);
  });

  it("rejects a missing query with 400", async () => {
    const res = await request(app).get("/api/v1/medicines/search");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("validation_error");
  });

  it("rejects an out-of-range limit with 400", async () => {
    const res = await request(app).get("/api/v1/medicines/search").query({ q: "a", limit: 500 });
    expect(res.status).toBe(400);
  });

  it("rejects a non-numeric page with 400", async () => {
    const res = await request(app).get("/api/v1/medicines/search").query({ q: "a", page: "abc" });
    expect(res.status).toBe(400);
  });

  it("returns a medicine by id", async () => {
    const res = await request(app).get("/api/v1/medicines/med-0001");
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe("med-0001");
  });

  it("returns 404 for an unknown medicine id", async () => {
    const res = await request(app).get("/api/v1/medicines/med-nope");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("not_found");
  });

  it("rejects an invalid id format with 400", async () => {
    const res = await request(app).get("/api/v1/medicines/bad.id!chars");
    expect(res.status).toBe(400);
  });
});

describe("Generics", () => {
  it("search returns generics", async () => {
    const res = await request(app).get("/api/v1/generics/search").query({ q: "Amoxicillin" });
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  it("returns a generic by id", async () => {
    const res = await request(app).get("/api/v1/generics/gen-0001");
    expect(res.status).toBe(200);
    expect(res.body.data.brandCount).toBe(2);
  });

  it("returns 404 for unknown generic", async () => {
    const res = await request(app).get("/api/v1/generics/gen-none");
    expect(res.status).toBe(404);
  });
});

describe("Manufacturers", () => {
  it("lists manufacturers", async () => {
    const res = await request(app).get("/api/v1/manufacturers");
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  it("returns a manufacturer by id", async () => {
    const res = await request(app).get("/api/v1/manufacturers/mfr-0001");
    expect(res.status).toBe(200);
    expect(res.body.data.productCount).toBeGreaterThan(0);
  });

  it("lists a manufacturer's medicines", async () => {
    const res = await request(app).get("/api/v1/manufacturers/mfr-0001/medicines");
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  it("404s on unknown manufacturer medicines", async () => {
    const res = await request(app).get("/api/v1/manufacturers/mfr-none/medicines");
    expect(res.status).toBe(404);
  });
});

describe("Categories", () => {
  it("lists categories", async () => {
    const res = await request(app).get("/api/v1/categories");
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  it("returns a category and its medicines", async () => {
    const cat = await request(app).get("/api/v1/categories/cat-antibiotic");
    expect(cat.status).toBe(200);
    const meds = await request(app).get("/api/v1/categories/cat-antibiotic/medicines");
    expect(meds.status).toBe(200);
    expect(meds.body.data.length).toBe(2);
  });

  it("404s on unknown category", async () => {
    const res = await request(app).get("/api/v1/categories/cat-none");
    expect(res.status).toBe(404);
  });
});

describe("Unknown routes", () => {
  it("returns 404 JSON for an unknown /api path", async () => {
    const res = await request(app).get("/api/v1/nope");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("not_found");
  });
});

describe("Security headers", () => {
  it("sets helmet security headers and hides x-powered-by", async () => {
    const res = await request(app).get("/api/v1/health");
    expect(res.headers["x-powered-by"]).toBeUndefined();
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });
});
