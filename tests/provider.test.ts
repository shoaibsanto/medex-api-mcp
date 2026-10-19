import { describe, it, expect } from "vitest";
import { FixtureProvider } from "../src/provider/fixture-provider.js";

describe("FixtureProvider", () => {
  const p = new FixtureProvider();

  it("reports itself as a non-live fixture provider", () => {
    expect(p.isLive).toBe(false);
    expect(p.name).toBe("fixture");
  });

  it("finds a medicine by direct name search", async () => {
    const res = await p.searchMedicines({ q: "Paracetamol" });
    expect(res.data.length).toBeGreaterThan(0);
    expect(res.data.every((m) => m.generic === "Paracetamol")).toBe(true);
  });

  it("matches on active ingredient", async () => {
    const res = await p.searchMedicines({ q: "Salbutamol Sulfate" });
    expect(res.data.length).toBe(1);
    expect(res.data[0].id).toBe("med-0012");
  });

  it("matches on manufacturer name", async () => {
    const res = await p.searchMedicines({ q: "Fixture Pharma" });
    expect(res.data.length).toBeGreaterThan(0);
  });

  it("returns paginated metadata", async () => {
    const res = await p.searchMedicines({ q: "a", page: 1, limit: 5 });
    expect(res.meta.limit).toBe(5);
    expect(res.meta.page).toBe(1);
    expect(res.meta.total).toBeGreaterThanOrEqual(res.data.length);
    expect(typeof res.meta.totalPages).toBe("number");
  });

  it("returns empty data for a query that matches nothing", async () => {
    const res = await p.searchMedicines({ q: "zzz-no-such-medicine-zzz" });
    expect(res.data).toHaveLength(0);
    expect(res.meta.total).toBe(0);
  });

  it("gets a single medicine by id with source attribution", async () => {
    const res = await p.getMedicine("med-0001");
    expect(res).not.toBeNull();
    expect(res!.data.id).toBe("med-0001");
    expect(res!.source.kind).toBe("fixture");
  });

  it("returns null for an unknown medicine id", async () => {
    expect(await p.getMedicine("med-does-not-exist")).toBeNull();
  });

  it("lists generics and resolves brand counts", async () => {
    const res = await p.searchGenerics({ q: "Paracetamol" });
    expect(res.data).toHaveLength(1);
    expect(res.data[0].brandCount).toBe(2);
  });

  it("lists manufacturers with product counts", async () => {
    const res = await p.listManufacturers({ page: 1, limit: 50 });
    expect(res.data.length).toBeGreaterThan(0);
    const fp = res.data.find((m) => m.id === "mfr-0001")!;
    expect(fp.productCount).toBeGreaterThan(0);
  });

  it("lists a manufacturer's medicines consistently", async () => {
    const res = await p.listManufacturerMedicines("mfr-0001", { page: 1, limit: 50 });
    expect(res.data.length).toBeGreaterThan(0);
    expect(res.data.every((m) => m.manufacturerId === "mfr-0001")).toBe(true);
  });

  it("returns an empty page for an unknown manufacturer's medicines", async () => {
    const res = await p.listManufacturerMedicines("mfr-none", { page: 1, limit: 20 });
    expect(res.data).toHaveLength(0);
  });

  it("lists categories with medicine counts", async () => {
    const res = await p.listCategories({ page: 1, limit: 50 });
    expect(res.data.length).toBeGreaterThan(0);
  });

  it("lists a category's medicines", async () => {
    const res = await p.listCategoryMedicines("cat-antibiotic", { page: 1, limit: 50 });
    expect(res.data.length).toBe(2); // amoxicillin + azithromycin
  });

  it("clamps out-of-range page to the last valid page", async () => {
    const res = await p.searchMedicines({ q: "Paracetamol", page: 999, limit: 5 });
    expect(res.meta.page).toBeLessThanOrEqual(res.meta.totalPages);
  });
});
