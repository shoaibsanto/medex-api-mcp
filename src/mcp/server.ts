import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { buildProvider } from "../provider/index.js";
import { VERSION } from "../config.js";

/**
 * MedEx MCP server.
 *
 * Exposes the same capabilities as the REST API as MCP tools, backed directly
 * by the configured Provider. Each tool returns structured JSON text content
 * with source attribution preserved, and surfaces empty results or provider
 * failures as clear, non-throwing messages.
 */

const provider = buildProvider();

/** Wrap a result into the MCP text-content shape. */
function text(payload: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }] };
}

/** Common error envelope returned when the provider throws. */
function providerError(tool: string, err: unknown) {
  return text({
    error: {
      code: "provider_error",
      tool,
      message: err instanceof Error ? err.message : String(err),
      dataSource: provider.isLive ? "live" : "fixture",
    },
  });
}

const page = z.coerce.number().int().min(1).default(1);
const limit = z.coerce.number().int().min(1).max(100).default(20);
const qParam = z.string().trim().min(1).max(200);
const idParam = z.string().trim().min(1).max(64);

export function buildServer(): McpServer {
  const server = new McpServer({ name: "medex-mcp", version: VERSION });

  server.tool(
    "search_medicines",
    "Search medicine brands by name, generic, active ingredient, or manufacturer. " +
      "Returns paginated results with source attribution.",
    { q: qParam, page, limit },
    async ({ q, page: p, limit: l }) => {
      try {
        return text(await provider.searchMedicines({ q, page: p, limit: l }));
      } catch (err) {
        return providerError("search_medicines", err);
      }
    },
  );

  server.tool(
    "get_medicine_details",
    "Retrieve a single medicine brand by its exact id.",
    { id: idParam },
    async ({ id }) => {
      try {
        const r = await provider.getMedicine(id);
        if (!r) return text({ error: { code: "not_found", message: `Medicine '${id}' not found.` } });
        return text(r);
      } catch (err) {
        return providerError("get_medicine_details", err);
      }
    },
  );

  server.tool(
    "search_generics",
    "Search generic / active-ingredient entries by name.",
    { q: qParam, page, limit },
    async ({ q, page: p, limit: l }) => {
      try {
        return text(await provider.searchGenerics({ q, page: p, limit: l }));
      } catch (err) {
        return providerError("search_generics", err);
      }
    },
  );

  server.tool(
    "get_generic_details",
    "Retrieve a single generic entry by its exact id, including its brand count.",
    { id: idParam },
    async ({ id }) => {
      try {
        const r = await provider.getGeneric(id);
        if (!r) return text({ error: { code: "not_found", message: `Generic '${id}' not found.` } });
        return text(r);
      } catch (err) {
        return providerError("get_generic_details", err);
      }
    },
  );

  server.tool(
    "list_manufacturers",
    "List manufacturers, optionally filtered by a name substring.",
    { q: z.string().trim().max(200).optional(), page, limit },
    async ({ q, page: p, limit: l }) => {
      try {
        return text(await provider.listManufacturers({ page: p, limit: l, q }));
      } catch (err) {
        return providerError("list_manufacturers", err);
      }
    },
  );

  server.tool(
    "get_manufacturer_details",
    "Retrieve a single manufacturer by its exact id, including its product count.",
    { id: idParam },
    async ({ id }) => {
      try {
        const r = await provider.getManufacturer(id);
        if (!r) return text({ error: { code: "not_found", message: `Manufacturer '${id}' not found.` } });
        return text(r);
      } catch (err) {
        return providerError("get_manufacturer_details", err);
      }
    },
  );

  server.tool(
    "list_manufacturer_medicines",
    "List medicine brands produced by a given manufacturer id.",
    { id: idParam, page, limit },
    async ({ id, page: p, limit: l }) => {
      try {
        const mf = await provider.getManufacturer(id);
        if (!mf) return text({ error: { code: "not_found", message: `Manufacturer '${id}' not found.` } });
        return text(await provider.listManufacturerMedicines(id, { page: p, limit: l }));
      } catch (err) {
        return providerError("list_manufacturer_medicines", err);
      }
    },
  );

  server.tool(
    "list_medicine_categories",
    "List therapeutic / classification categories, optionally filtered by name.",
    { q: z.string().trim().max(200).optional(), page, limit },
    async ({ q, page: p, limit: l }) => {
      try {
        return text(await provider.listCategories({ page: p, limit: l, q }));
      } catch (err) {
        return providerError("list_medicine_categories", err);
      }
    },
  );

  server.tool(
    "list_category_medicines",
    "List medicine brands belonging to a given category id.",
    { id: idParam, page, limit },
    async ({ id, page: p, limit: l }) => {
      try {
        const cat = await provider.getCategory(id);
        if (!cat) return text({ error: { code: "not_found", message: `Category '${id}' not found.` } });
        return text(await provider.listCategoryMedicines(id, { page: p, limit: l }));
      } catch (err) {
        return providerError("list_category_medicines", err);
      }
    },
  );

  return server;
}

export async function startStdio(): Promise<void> {
  const server = buildServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // eslint-disable-next-line no-console
  console.error(`[medex-mcp] v${VERSION} ready on stdio (provider=${provider.name})`);
}

// Only auto-start when executed directly (not when imported by tests).
const isEntrypoint = process.argv[1] && /medex-mcp|mcp[\\/]index/.test(process.argv[1]);
if (isEntrypoint) {
  startStdio().catch((err) => {
    // eslint-disable-next-line no-console
    console.error("[medex-mcp] failed to start:", err);
    process.exit(1);
  });
}
