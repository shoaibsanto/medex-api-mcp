# MedEx API + MCP

An API and Model Context Protocol (MCP) server for Bangladesh medicine information.

> **Data source:** The default provider drives a **headless browser against
> medex.com.bd on demand** — every tool call retrieves fresh data from the live
> website at request time. There is no database, no local dataset, and no
> cached records; the fixture provider exists only behind the explicit
> `MEDEX_PROVIDER=fixture` switch for offline development and tests. Every live
> record carries `source.kind: "live"`, its exact source page URL, and a
> retrieval timestamp. See [DATA_SOURCES.md](DATA_SOURCES.md) for the full
> authorization posture, field-availability rules, and limitations.

---

## What it does

- Exposes medicine, generic, manufacturer, and category information over a
  versioned REST API (`/api/v1`).
- Exposes the same capabilities as **MCP tools** so AI agents (including
  Hermes Agent) can query the data with structured, validated inputs.
- Fetches every response **live from medex.com.bd at request time** via
  Playwright-driven browser navigation, with a configurable politeness delay
  between page loads.

## Architecture

```
                 ┌────────────────────┐
   REST clients ─▶                    │
                 │   Express API      │──┐
   AI agents ───▶   (src/api)         │  │   Provider interface
     (MCP)       │                    │  │   (src/provider/provider.ts)
                 └────────────────────┘  │        ▲
                 ┌────────────────────┐  │        │ (default)
   MCP client ──▶│   MCP server       │──┘   LiveProvider
     (stdio)     │   (src/mcp)        │        (src/provider/live-provider.ts)
                 └────────────────────┘             │ uses
                                              BrowserSession (Playwright)
                                              (src/browser/session.ts)
                                                    │ parses
                                              extract.ts (cheerio)
                                                    ▼
                                            https://medex.com.bd
```

Two entry points share one **Provider** interface:

- **REST API** (`src/api`) — Express app with validation, rate limiting,
  security headers, and consistent error envelopes.
- **MCP server** (`src/mcp`) — MCP SDK server exposing the provider as tools
  over stdio.

Provider-specific data access is kept behind the `Provider` interface, so the
routes and MCP tools never touch the data source directly.

### Live browser pipeline

Each request follows the same path:

1. `LiveProvider` builds the target medex.com.bd URL for the tool call.
2. `BrowserSession` (one lazily-launched headless Chrome/Edge/Chromium,
   reused within the process) navigates to it after the politeness delay.
3. `extract.ts` parses the rendered HTML with cheerio and returns only the
   fields actually present on that page.
4. The record is stamped with `source.sourceUrl` + `source.retrievedAt` and
   returned. Nothing is persisted.

Failures (timeouts, 403/429/5xx, unparseable pages) raise an explicit
`NavigationError`/`LiveAccessError`; the provider never falls back to fixtures
or fabricated data. Unknown ids return `null` ("not found"), never a guess.

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

Requires **Node.js ≥ 20** (developed and tested on Node 26) and a locally
installed **Chrome, Edge, or Chromium** browser (Playwright drives it; the
Playwright-bundled chromium is used as a last resort).

```bash
git clone https://github.com/shoaibsanto/medex-api-mcp.git
cd medex-api-mcp
npm install
npm run build
```

## Local development

```bash
# Start the REST API on http://127.0.0.1:3000 (live provider by default)
npm start

# Or run in watch mode during development
npm run dev

# Start the MCP server on stdio
npm run mcp

# Run a small polite smoke test against the real medex.com.bd
npm run smoke:live
```

Configuration is read from environment variables (see [.env.example](.env.example)):

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | API port |
| `HOST` | `127.0.0.1` | Bind address |
| `MEDEX_PROVIDER` | `live` | Data provider (`live` or `fixture`) |
| `MEDEX_REQUEST_DELAY_MS` | `1200` | Minimum delay between page navigations |
| `MEDEX_NAV_TIMEOUT_MS` | `30000` | Per-navigation timeout |
| `MEDEX_BROWSER_EXECUTABLE` | *(auto)* | Explicit browser binary; auto-detects Chrome → Edge → bundled Chromium |
| `MEDEX_CATEGORY_MAX_EXPANSIONS` | `8` | Generic pages `list_category_medicines` may expand per call |
| `MEDEX_CORS_ORIGIN` | `*` | CORS origin(s), comma-separated |
| `MEDEX_RATE_LIMIT_MAX` | `100` | API requests per window per IP |
| `MEDEX_RATE_LIMIT_WINDOW_MS` | `900000` | Rate-limit window (15 min) |

## Running tests

```bash
npm run typecheck   # TypeScript, no emit
npm test            # vitest: unit + API + MCP + extraction + live-provider + validation
npm run build       # compile to dist/
npm run smoke:live  # live smoke test against medex.com.bd (network + browser required)
```

The suite covers provider unit behaviour, REST integration (including 400/404
validation and error paths), MCP tool registration and structured output,
API↔MCP data consistency, HTML-extraction parsers (against mocked pages), and
LiveProvider behaviour (against a fake browser session — no network). The live
smoke test is separate and opt-in because it navigates the real website.

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

- **Live, on-demand browser retrieval.** Every response is fetched from
  medex.com.bd at request time; nothing is bulk-downloaded, stored, or
  republished. The provider obeys a politeness delay and surfaces upstream
  blocks (403/429) as explicit errors instead of retrying around them.
- MedEx has a privacy policy but **no terms-of-service page, no official API,
  and no published licensing terms** for automated collection. Its `robots.txt`
  is permissive, but that governs crawling access — it is not a copyright or
  database license. Operators are responsible for confirming their usage
  complies with MedEx's terms.
- Only fields actually published on the fetched page are returned; missing
  fields are `null`, never invented.
- Search-result and company-brand-card rows do not publish prices, so
  `priceBdt`/`package` are `null` there — call `get_medicine_details` for the
  full record.
- Category listings are generic-level on MedEx; `list_category_medicines`
  expands a bounded number of generic pages per call and reports the bound in
  `meta.note`.
- **Fixture mode** (`MEDEX_PROVIDER=fixture`) serves fictional records for
  offline development only; every fixture record is marked
  `source.kind: "fixture"`. Never use fixture data for clinical decisions.

See [DATA_SOURCES.md](DATA_SOURCES.md) for the full write-up.

## Security and responsible use

- No secrets are committed. Configuration uses `.env` (git-ignored) with
  placeholders in `.env.example`.
- The API sets security headers (helmet), enforces input validation, applies
  rate limiting, and returns consistent error envelopes without stack traces.
- The live provider uses no credentials, cookies, or sessions, and does not
  bypass CAPTCHAs or access controls.
- This project is intended for **informational, developer, and research use**.
  Medicine information is **not a substitute for professional medical advice**.
  Never present fixture data as verified clinical information.

See [SECURITY.md](SECURITY.md).

## Project status

**v0.2.0 — live browser provider.**

- ✅ REST API implemented and tested
- ✅ MCP server implemented and tested (stdio)
- ✅ **Live browser-based provider (Playwright) — default**
- ✅ Extraction layer with mocked-page tests; LiveProvider tests with a fake session
- ✅ Opt-in live smoke test (`npm run smoke:live`)
- ✅ Offline fixture provider retained for development/tests (`MEDEX_PROVIDER=fixture`)
- ✅ OpenAPI spec, docs, CI workflow

See [CHANGELOG.md](CHANGELOG.md).

## License

Source code in this repository is released under the [MIT License](LICENSE).
This applies to the code only — **not** to any third-party medicine data. See
[DATA_SOURCES.md](DATA_SOURCES.md) for why no upstream data is redistributed.
