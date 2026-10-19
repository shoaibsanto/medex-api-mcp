# MedEx API + MCP

An API and Model Context Protocol (MCP) server for Bangladesh medicine information.

> **Important — data source:** This project ships with a **synthetic fixture
> provider** by default. It does **not** serve live MedEx data. No official or
> licensed MedEx API was available, and no written authorization to scrape or
> redistribute MedEx's database exists. Every default record is marked
> `source.kind: "fixture"` and must never be used for clinical decisions. See
> [DATA_SOURCES.md](DATA_SOURCES.md) for the full authorization status and how
> to plug in an authorized live provider.

---

## What it does

- Exposes medicine, generic, manufacturer, and category information over a
  versioned REST API (`/api/v1`).
- Exposes the same capabilities as **MCP tools** so AI agents (including
  Hermes Agent) can query the data with structured, validated inputs.
- Ships with everything wired to a local fixture dataset so it runs offline
  with **zero credentials** — ideal for development, testing, and demos.

## Architecture

```
                 ┌────────────────────┐
   REST clients ─▶                    │
                 │   Express API      │──┐
   AI agents ───▶   (src/api)         │  │   Provider interface
     (MCP)       │                    │  │   (src/provider/provider.ts)
                 └────────────────────┘  │
                 ┌────────────────────┐  │        ▲
   MCP client ──▶│   MCP server       │──┘        │
     (stdio)     │   (src/mcp)        │     FixtureProvider (default)
                 └────────────────────┘     (src/provider/fixture-provider.ts)
                                              ▲ reads
                                        fixtures/medex-fixtures.json
```

Two entry points share one **Provider** interface:

- **REST API** (`src/api`) — Express app with validation, rate limiting,
  security headers, and consistent error envelopes.
- **MCP server** (`src/mcp`) — MCP SDK server exposing the provider as tools
  over stdio.

Provider-specific data access is kept behind the `Provider` interface, so the
routes and MCP tools never touch the data source directly. Swapping in an
authorized live provider means adding one implementation and selecting it via
`MEDEX_PROVIDER` — no route or tool changes.

## Implemented API endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/health` | Service health + provider info |
| GET | `/api/v1/ready` | Readiness probe |
| GET | `/api/v1/medicines/search?q=&page=&limit=` | Search medicines |
| GET | `/api/v1/medicines/:id` | Get a medicine by id |
| GET | `/api/v1/generics/search?q=&page=&limit=` | Search generics |
| GET | `/api/v1/generics/:id` | Get a generic by id |
| GET | `/api/v1/manufacturers?page=&limit=&q=` | List manufacturers |
| GET | `/api/v1/manufacturers/:id` | Get a manufacturer by id |
| GET | `/api/v1/manufacturers/:id/medicines` | List a manufacturer's medicines |
| GET | `/api/v1/categories?page=&limit=&q=` | List categories |
| GET | `/api/v1/categories/:id` | Get a category by id |
| GET | `/api/v1/categories/:id/medicines` | List a category's medicines |

Full request/response schemas: [openapi.yaml](openapi.yaml) · prose docs: [API.md](API.md).

## Implemented MCP tools

| Tool | Description |
|---|---|
| `search_medicines` | Search brands by name, generic, ingredient, or manufacturer |
| `get_medicine_details` | Retrieve one medicine by id |
| `search_generics` | Search generic / active-ingredient entries |
| `get_generic_details` | Retrieve one generic by id |
| `list_manufacturers` | List manufacturers (optional name filter) |
| `get_manufacturer_details` | Retrieve one manufacturer by id |
| `list_manufacturer_medicines` | List a manufacturer's brands |
| `list_medicine_categories` | List therapeutic categories |
| `list_category_medicines` | List a category's brands |

Connection details for agents: [MCP.md](MCP.md).

## Installation

Requires **Node.js ≥ 20** (developed and tested on Node 26).

```bash
git clone https://github.com/shoaibsanto/medex-api-mcp.git
cd medex-api-mcp
npm install
npm run build
```

## Local development

```bash
# Start the REST API on http://127.0.0.1:3000
npm start

# Or run in watch mode during development
npm run dev

# Start the MCP server on stdio
npm run mcp
```

Configuration is read from environment variables (see [.env.example](.env.example)):

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | API port |
| `HOST` | `127.0.0.1` | Bind address |
| `MEDEX_PROVIDER` | `fixture` | Data provider (`fixture`; `live` not yet supported) |
| `MEDEX_CORS_ORIGIN` | `*` | CORS origin(s), comma-separated |
| `MEDEX_RATE_LIMIT_MAX` | `100` | Requests per window per IP |
| `MEDEX_RATE_LIMIT_WINDOW_MS` | `900000` | Rate-limit window (15 min) |

## Running tests

```bash
npm run typecheck   # TypeScript, no emit
npm test            # vitest: unit + API + MCP + validation + rate-limit
npm run build       # compile to dist/
```

The suite covers provider unit behaviour, REST integration (including 400/404
validation and error paths), MCP tool registration and structured output,
API↔MCP data consistency, rate limiting, CORS, and security headers.

## Connecting the MCP server to an AI agent

The MCP server speaks **stdio**. Add it to your agent's MCP config. For Hermes
Agent, the relevant block is:

```yaml
mcp_servers:
  medex:
    command: node
    args:
      - /absolute/path/to/medex-api-mcp/dist/mcp/index.js
```

The REST API is the default integration boundary for anything that prefers
HTTP. See [MCP.md](MCP.md) for details and tool schemas.

## Data-source authorization and limitations

- **Default provider = synthetic fixtures.** No live MedEx data is served or
  redistributed by this repository.
- MedEx has a privacy policy but **no terms-of-service page, no official API,
  and no published licensing terms** for automated collection or redistribution.
  Its `robots.txt` is permissive, but that governs crawling access — it is not
  a copyright or database license.
- The fixtures are fictional records (fictional brands, manufacturers, and
  prices) that exist solely to exercise the API and MCP code paths.
- To use real data you must obtain **written authorization** and an official or
  licensed feed, then implement a `Provider` and select it with
  `MEDEX_PROVIDER=live`. The `live` case currently throws deliberately rather
  than silently serving fixtures.

See [DATA_SOURCES.md](DATA_SOURCES.md) for the full write-up.

## Security and responsible use

- No secrets are committed. Configuration uses `.env` (git-ignored) with
  placeholders in `.env.example`.
- The API sets security headers (helmet), enforces input validation, applies
  rate limiting, and returns consistent error envelopes without stack traces.
- This project is intended for **informational, developer, and research use**.
  Medicine information is **not a substitute for professional medical advice**.
  Never present fixture data as verified clinical information.

See [SECURITY.md](SECURITY.md).

## Project status

**v0.1.0 — functional MVP.**

- ✅ REST API implemented and tested
- ✅ MCP server implemented and tested (stdio)
- ✅ Synthetic fixture provider, extensible `Provider` seam
- ✅ OpenAPI spec, docs, CI workflow
- ⏳ Authorized live provider: **not implemented** (requires authorization)

See [CHANGELOG.md](CHANGELOG.md).

## License

Source code in this repository is released under the [MIT License](LICENSE).
This applies to the code only — **not** to any third-party medicine data. See
[DATA_SOURCES.md](DATA_SOURCES.md) for why no upstream data is redistributed.
