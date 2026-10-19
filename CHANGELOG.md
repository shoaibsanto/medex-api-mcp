# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/). Versions follow
[Semantic Versioning](https://semver.org/).

## [0.2.0] - 2026-10-19

Live browser-based data provider.

### Added

- **LiveProvider** (`src/provider/live-provider.ts`) — the new default. Every
  tool call navigates medex.com.bd at request time via headless browser and
  returns only the fields actually published on the fetched page.
- **BrowserSession** (`src/browser/session.ts`) — Playwright (playwright-core)
  lifecycle: lazy launch of local Chrome → Edge → bundled Chromium, FIFO
  navigation queue with configurable politeness delay
  (`MEDEX_REQUEST_DELAY_MS`, default 1200 ms), per-navigation timeout
  (`MEDEX_NAV_TIMEOUT_MS`), explicit `NavigationError` for timeouts / 403 /
  429 / 5xx / upstream blocks (no bypass, no silent fallback).
- **Extraction layer** (`src/browser/extract.ts`) — cheerio parsers for
  search-result rows, brand pages, generic pages, company listings, company
  brands pages, company info pages, and drug-class pages.
- **`npm run smoke:live`** (`scripts/live-smoke.mjs`) — opt-in smoke test
  against the real website; verifies live extraction, not-found handling, and
  live source attribution.
- New env vars: `MEDEX_REQUEST_DELAY_MS`, `MEDEX_NAV_TIMEOUT_MS`,
  `MEDEX_BROWSER_EXECUTABLE`, `MEDEX_CATEGORY_MAX_EXPANSIONS`.
- New tests: `tests/extract.test.ts` (parsers vs. mocked HTML pages) and
  `tests/live-provider.test.ts` (LiveProvider vs. a fake browser session —
  including a test that every lookup fails loudly when the site is
  unreachable, proving no fixture fallback exists).

### Changed

- **Default provider is now `live`.** `MEDEX_PROVIDER=fixture` remains as an
  explicit offline switch; the factory no longer throws on `live`.
- Domain types widened where live pages legitimately omit values:
  `Medicine.strength` / `manufacturerId` / `manufacturerName` / `package`,
  `Generic.brandCount`, `Manufacturer.productCount`, `Category.medicineCount`
  are now nullable; `PageMeta` gained `totalExact` and `note` (MedEx does not
  publish total result counts, so `total` is `-1`/unknown where applicable).
- Docs updated for live retrieval: README, DATA_SOURCES.md, MCP.md,
  ARCHITECTURE.md, `.env.example`, openapi.yaml.

### Notes

- Search-result rows and company brand cards do not publish prices; those
  fields are `null` there by design — call the detail endpoint for the full
  record.
- Category (`drug-class`) listings are generic-level on MedEx;
  `list_category_medicines` expands a bounded number of generic pages per call
  and reports the bound in `meta.note`.

## [0.1.0] - 2026-10-19

Initial release.

### Added

- **REST API** under `/api/v1` with 12 endpoints: health/ready, medicine and
  generic search + detail, manufacturer list/detail/medicines, and category
  list/detail/medicines.
- **MCP server** (stdio) exposing 9 tools backed by the same provider.
- **Provider abstraction** (`Provider` interface + `buildProvider()` factory).
- **Synthetic fixture provider** (`FixtureProvider`) reading
  `fixtures/medex-fixtures.json`, clearly marked `source.kind: "fixture"`.
- Deliberate `MEDEX_PROVIDER=live` guard that threw until an authorized live
  provider was implemented (superseded in 0.2.0 by the live browser provider;
  see DATA_SOURCES.md).
- Input validation (Zod), pagination, consistent error envelopes, request body
  limit, request timeouts via graceful shutdown.
- Rate limiting (`express-rate-limit`), security headers (helmet), configurable
  CORS.
- OpenAPI 3.0 specification (`openapi.yaml`).
- Documentation: README, API.md, MCP.md, ARCHITECTURE.md, DATA_SOURCES.md,
  SECURITY.md, CONTRIBUTING.md.
- Test suite (vitest + supertest): provider unit tests, REST integration tests,
  MCP tool tests, API↔MCP consistency, validation/error/empty-result tests,
  rate-limit test, CORS test, security-header test.
- GitHub Actions CI workflow (typecheck, build, test, audit) on Node 20 & 22.
- MIT license (code only — not third-party data).

### Security

- No committed secrets; `.env` git-ignored, `.env.example` uses placeholders.
- Dependency audit clean (0 vulnerabilities) at time of release.
