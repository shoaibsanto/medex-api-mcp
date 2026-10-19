# MCP Server

The MedEx MCP server exposes the same capabilities as the REST API as
**Model Context Protocol** tools, so AI agents can query medicine information
with structured, validated inputs.

## Transport

- **stdio** — the primary and currently only implemented transport. The server
  reads JSON-RPC on stdin and writes responses on stdout. This is the right
  choice for a locally-spawned, single-client server (the model Hermes Agent,
  Claude Desktop, and most MCP hosts use).
- **Remote HTTP transport** — not enabled. It would need to be justified and
  built separately; the local fixture provider has no multi-tenant or auth story
  yet.

## Running

```bash
npm run build      # once
npm run mcp        # node dist/mcp/index.js  (stdio)
```

The server logs a one-line readiness message to **stderr**:
`[medex-mcp] v0.1.0 ready on stdio (provider=fixture)`. Nothing is ever written
to stdout except JSON-RPC, so stdio stays clean.

## Connecting from Hermes Agent

Add a `mcp_servers` entry to the Hermes config
(`~/AppData/Local/hermes/config.yaml`):

```yaml
mcp_servers:
  medex:
    command: node
    args:
      - C:/absolute/path/to/medex-api-mcp/dist/mcp/index.js
```

Then restart Hermes (or reload MCP servers). The nine tools below appear in the
tool list. No API key or token is required — the server drives a local
headless browser against medex.com.bd.

> On Windows use a forward-slash absolute path to `dist/mcp/index.js`.

## Connecting from other MCP hosts

Any MCP client that speaks stdio can launch the server. Generic config shape:

```json
{
  "mcpServers": {
    "medex": {
      "command": "node",
      "args": ["/absolute/path/to/medex-api-mcp/dist/mcp/index.js"]
    }
  }
}
```

## Tools

| Tool | Input | Returns |
|---|---|---|
| `search_medicines` | `q` (req), `page`, `limit` | Paginated medicines |
| `get_medicine_details` | `id` (req) | One medicine |
| `search_generics` | `q` (req), `page`, `limit` | Paginated generics |
| `get_generic_details` | `id` (req) | One generic |
| `list_manufacturers` | `q`, `page`, `limit` | Paginated manufacturers |
| `get_manufacturer_details` | `id` (req) | One manufacturer |
| `list_manufacturer_medicines` | `id` (req), `page`, `limit` | That manufacturer's medicines |
| `list_medicine_categories` | `q`, `page`, `limit` | Paginated categories |
| `list_category_medicines` | `id` (req), `page`, `limit` | That category's medicines |

Each tool returns **structured JSON as text content**, with the same `data` /
`meta` / `source` shape as the REST API. `source.kind` is `"live"`, with the
exact page URL and retrieval timestamp, for the default provider.

## Behaviour guarantees

- **Input validation** — `q` is 1–200 chars; `id` is 1–64 chars of
  `[A-Za-z0-9_-]`; `limit` is 1–100; `page` ≥ 1.
- **Empty results** return `{ data: [], meta: { total: 0, ... } }`, not an error.
- **Unknown ids** return a structured `{ error: { code: "not_found", ... } }`
  instead of throwing, so the agent gets a usable message.
- **Provider failures** are caught and returned as a structured
  `provider_error` envelope.
- **Source attribution** is preserved on every non-error response.

## Data-source note

The MCP server reads from the same `Provider` as the REST API. By default that
is the **live browser provider**: each tool call navigates medex.com.bd at
request time via Playwright + a locally installed Chrome/Edge/Chromium, with a
politeness delay between page loads. No database, no cached dataset, no fixture
fallback — a failed navigation surfaces as an explicit `provider_error`.
Search-result rows do not publish prices (`priceBdt`/`package` are `null`
there); call `get_medicine_details` for the full record. See
[DATA_SOURCES.md](DATA_SOURCES.md). Medicine information returned here is
**not** a substitute for professional medical advice.
