# Architecture

## Goals

- Keep **provider-specific data access** separate from business logic.
- Serve the same capabilities through **two interfaces** (REST + MCP) without
  duplicating logic.
- Retrieve data **live, on demand** — no database, no cached dataset.
- Keep a **fixture provider** selectable for offline development and tests.

## Components

```
src/
  types.ts                 Domain types + source attribution
  config.ts                Environment-driven configuration
  index.ts                 REST API entry point (starts Express)
  api/
    app.ts                 Express app: middleware + all routes
    errors.ts              HttpError, not-found, central error handler
    validation.ts          Zod schemas for query/path params
  provider/
    provider.ts            Provider interface (the seam)
    live-provider.ts       Live browser implementation (default)
    fixture-provider.ts    Synthetic fixture implementation (MEDEX_PROVIDER=fixture)
    index.ts               buildProvider() factory
  browser/
    session.ts             Playwright browser lifecycle + politeness queue
    extract.ts             cheerio parsers (HTML -> records)
  mcp/
    server.ts              MCP SDK server + tool definitions
    index.ts               MCP stdio entry point
fixtures/
  medex-fixtures.json      Synthetic development records (fixture mode only)
scripts/
  live-smoke.mjs           Opt-in live smoke test against medex.com.bd
```

## The Provider seam

`Provider` (`src/provider/provider.ts`) is the single abstraction between the
application and the data source:

```ts
interface Provider {
  readonly name: string;
  readonly displayName: string;
  readonly isLive: boolean;

  searchMedicines(query): Promise<Paginated<Medicine>>;
  getMedicine(id): Promise<Single<Medicine> | null>;
  searchGenerics(query): Promise<Paginated<Generic>>;
  getGeneric(id): Promise<Single<Generic> | null>;
  listManufacturers(query): Promise<Paginated<Manufacturer>>;
  getManufacturer(id): Promise<Single<Manufacturer> | null>;
  listManufacturerMedicines(id, query): Promise<Paginated<Medicine>>;
  listCategories(query): Promise<Paginated<Category>>;
  getCategory(id): Promise<Single<Category> | null>;
  listCategoryMedicines(id, query): Promise<Paginated<Medicine>>;
}
```

Both the Express routes and the MCP tools depend **only** on this interface.
Neither knows whether the data is a fixture or a live feed.

`buildProvider()` selects the implementation from `MEDEX_PROVIDER`. The default
is `live` (`LiveProvider`): it drives a headless browser through medex.com.bd
pages at request time, parses the rendered HTML with cheerio, and returns only
fields actually present on each page. `fixture` is an explicit offline switch
for development and tests. There is no silent fallback between the two — a
failed live request raises an explicit error. See
[DATA_SOURCES.md](DATA_SOURCES.md).

## Request flow

1. Request hits Express route (or an MCP tool handler).
2. Input is parsed/validated with Zod (`api/validation.ts`).
3. The route calls the matching `Provider` method.
4. The provider returns a `Paginated<T>` / `Single<T>` envelope with
   `SourceAttribution` populated.
5. The response is returned as JSON; errors are normalized by `api/errors.ts`.

## Why two entry points

- **REST** is the default integration boundary for HTTP clients, scripts, and
  anything that prefers plain JSON over a socket.
- **MCP** lets AI agents call the same functions as typed tools, with the host
  managing the connection.

Because both sit on the same `Provider`, behaviour, validation, and attribution
are identical across them — verified by the API↔MCP consistency test.

## Validation & errors

- Query/path inputs go through Zod schemas; failures produce a `400` with
  per-field `details`.
- `HttpError` carries a status + machine code; the central handler renders the
  consistent `{ error: { code, message, details? } }` envelope.
- Unexpected errors are logged server-side and returned as a generic
  `internal_error` (no stack-trace leakage).

## Security

- helmet security headers, `X-Powered-By` disabled.
- Configurable CORS.
- `express-rate-limit` (default 100 req / 15 min / IP).
- 100 kB JSON body limit.
- No secrets in code — config is read from env at runtime.

## Live browser pipeline & concurrency

`BrowserSession` lazily launches one headless browser per process and
**serializes** navigations through a FIFO queue with a configurable politeness
delay (`MEDEX_REQUEST_DELAY_MS`, default 1200 ms) between page loads. Each
request performs a **fresh navigation**; nothing is persisted between
requests. `extract.ts` parses the fetched HTML with cheerio, so extraction
logic is testable without a browser.

Failure handling: navigation timeouts, upstream 403/429/5xx, and unparseable
pages raise `NavigationError`/`LiveAccessError` (surfaced by the MCP/API layers
as a structured `provider_error`). Unknown ids return `null` → `not_found`.
The live provider never falls back to fixture data or fabricated records.

The fixture provider loads once at startup and serves from in-memory arrays —
useful for offline tests, not for production data.
