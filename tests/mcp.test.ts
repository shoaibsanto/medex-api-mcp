import { describe, it, expect } from "vitest";
import { buildServer } from "../src/mcp/server.js";
import { FixtureProvider } from "../src/provider/fixture-provider.js";

/**
 * Exercise the MCP server's registered tools directly through the SDK's
 * _registeredTools map. This verifies each tool is registered, validates its
 * input, and returns structured JSON with source attribution — without needing
 * a full stdio transport round-trip.
 *
 * These tests inject the offline FixtureProvider so they run without a
 * browser or network. Live-provider behaviour is covered by
 * tests/live-provider.test.ts and tests/extract.test.ts.
 */
type ToolHandler = (args: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text: string }> }>;

function getTool(name: string): ToolHandler {
  const server = buildServer(new FixtureProvider()) as unknown as {
    _registeredTools: Record<string, { handler: ToolHandler }>;
  };
  const t = server._registeredTools[name];
  if (!t) throw new Error(`tool ${name} is not registered`);
  return t.handler;
}

function parse(res: { content: Array<{ text: string }> }): Record<string, any> {
  return JSON.parse(res.content[0].text);
}

describe("MCP tools", () => {
  const expected = [
    "search_medicines",
    "get_medicine_details",
    "search_generics",
    "get_generic_details",
    "list_manufacturers",
    "get_manufacturer_details",
    "list_manufacturer_medicines",
    "list_medicine_categories",
    "list_category_medicines",
  ];

  it("registers all documented tools", () => {
    const server = buildServer() as unknown as { _registeredTools: Record<string, unknown> };
    for (const name of expected) {
      expect(server._registeredTools[name], `missing tool ${name}`).toBeTruthy();
    }
  });

  it("search_medicines returns structured results with source", async () => {
    const out = parse(await getTool("search_medicines")({ q: "Paracetamol" }));
    expect(out.data.length).toBeGreaterThan(0);
    expect(out.source.kind).toBe("fixture");
  });

  it("get_medicine_details returns a record by id", async () => {
    const out = parse(await getTool("get_medicine_details")({ id: "med-0003" }));
    expect(out.data.id).toBe("med-0003");
  });

  it("get_medicine_details surfaces a not_found error object (no throw)", async () => {
    const out = parse(await getTool("get_medicine_details")({ id: "med-none" }));
    expect(out.error.code).toBe("not_found");
  });

  it("search_generics returns generics", async () => {
    const out = parse(await getTool("search_generics")({ q: "Metformin" }));
    expect(out.data.length).toBeGreaterThan(0);
  });

  it("list_manufacturers returns manufacturers", async () => {
    const out = parse(await getTool("list_manufacturers")({}));
    expect(out.data.length).toBeGreaterThan(0);
  });

  it("list_manufacturer_medicines returns that manufacturer's brands", async () => {
    const out = parse(await getTool("list_manufacturer_medicines")({ id: "mfr-0002" }));
    expect(out.data.every((m: any) => m.manufacturerId === "mfr-0002")).toBe(true);
  });

  it("list_medicine_categories returns categories", async () => {
    const out = parse(await getTool("list_medicine_categories")({}));
    expect(out.data.length).toBeGreaterThan(0);
  });

  it("list_category_medicines returns that category's brands", async () => {
    const out = parse(await getTool("list_category_medicines")({ id: "cat-antibiotic" }));
    expect(out.data.length).toBe(2);
  });

  it("empty-result tools return an empty data array, not an error", async () => {
    const out = parse(await getTool("search_medicines")({ q: "zzz-no-match-zzz" }));
    expect(out.data).toHaveLength(0);
    expect(out.meta.total).toBe(0);
  });
});

describe("MCP <-> API consistency", () => {
  it("the MCP provider and API provider serve identical medicine data", async () => {
    const mcp = parse(await getTool("get_medicine_details")({ id: "med-0001" }));
    const provider = new FixtureProvider();
    const api = await provider.getMedicine("med-0001");
    expect(mcp.data).toEqual(api!.data);
  });
});
