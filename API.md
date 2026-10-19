# API Reference

Base URL (local): `http://127.0.0.1:3000`

All endpoints are under `/api/v1`. Responses are JSON. The machine-readable
contract is [openapi.yaml](openapi.yaml).

## Conventions

- **Pagination** — `page` (≥1, default 1) and `limit` (1–100, default 20).
- **Search** — `q` is required and must be 1–200 characters.
- **Errors** — consistent envelope:
  ```json
  { "error": { "code": "not_found", "message": "...", "details": [ ... ] } }
  ```
  Codes: `validation_error` (400), `not_found` (404), `rate_limited` (429),
  `internal_error` (500).
- **Source attribution** — every payload carries a `source` object:
  ```json
  { "provider": "fixture", "providerName": "Synthetic Development Fixtures",
    "kind": "fixture", "retrievedAt": "2026-01-01T00:00:00.000Z" }
  ```
  `kind` is `fixture` for synthetic data and `live` for an authorized feed.
- **Timestamps** — ISO-8601 UTC.

## Endpoints

### System

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/health` | Health, version, provider info, uptime |
| GET | `/api/v1/ready` | Readiness probe |

### Medicines

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/medicines/search?q=&page=&limit=` | Search by name, generic, active ingredient, or manufacturer |
| GET | `/api/v1/medicines/:id` | Get one medicine by id |

`Medicine` fields: `id`, `name`, `generic`, `activeIngredients[]`, `strength`,
`dosageForm`, `manufacturerId`, `manufacturerName`, `package`, `priceBdt`
(number or null), `categories[]`, `source`.

### Generics

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/generics/search?q=&page=&limit=` | Search generics |
| GET | `/api/v1/generics/:id` | Get one generic by id |

`Generic` fields: `id`, `name`, `activeIngredients[]`, `description` (or null),
`brandCount`, `source`.

### Manufacturers

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/manufacturers?page=&limit=&q=` | List manufacturers |
| GET | `/api/v1/manufacturers/:id` | Get one manufacturer by id |
| GET | `/api/v1/manufacturers/:id/medicines` | List that manufacturer's medicines |

`Manufacturer` fields: `id`, `name`, `description` (or null), `website` (or
null), `productCount`, `source`.

### Categories

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/categories?page=&limit=&q=` | List categories |
| GET | `/api/v1/categories/:id` | Get one category by id |
| GET | `/api/v1/categories/:id/medicines` | List that category's medicines |

`Category` fields: `id`, `name`, `description` (or null), `medicineCount`,
`source`.

## Examples

```bash
# Health
curl http://127.0.0.1:3000/api/v1/health

# Search
curl "http://127.0.0.1:3000/api/v1/medicines/search?q=Paracetamol&limit=2"

# Detail
curl http://127.0.0.1:3000/api/v1/medicines/med-0001

# A manufacturer's brands
curl http://127.0.0.1:3000/api/v1/manufacturers/mfr-0001/medicines
```

## Security & limits

- **Rate limiting** — default 100 requests / 15 min / IP (configurable). Excess
  returns `429` with a `rate_limited` error and standard `RateLimit` headers.
- **Headers** — helmet security headers; `X-Powered-By` removed.
- **CORS** — configurable via `MEDEX_CORS_ORIGIN`.
- **Body limit** — 100 kB JSON.
