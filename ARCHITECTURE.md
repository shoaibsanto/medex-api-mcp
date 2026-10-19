# Architecture

## Goals

- Keep **provider-specific data access** separate from business logic.
- Serve the same capabilities through **two interfaces** (REST + MCP) without
  duplicating logic.
- Make swapping in an **authorized live provider** a localized change.
- Ship **offline** with zero credentials via a synthetic fixture provider.

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
    fixture-provider.ts    Synthetic fixture implementation
    index.ts               buildProvider() factory
  mcp/
    server.ts              MCP SDK server + tool definitions
    index.ts               MCP stdio entry point
fixtures/
  medex-fixtures.json      Synthetic development records
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

`buildProvider()` selects the implementation from `MEDEX_PROVIDER`. The `live`
case currently **throws** on purpose: no authorized live source exists, and
silently serving fixtures as if they were live would be misleading. See
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

## Concurrency & performance

The fixture provider loads once at startup and serves from in-memory arrays.
There is no database or network dependency in the default configuration, so
latency is negligible and the service is safe to run on minimal hardware.
