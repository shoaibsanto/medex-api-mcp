# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/). Versions follow
[Semantic Versioning](https://semver.org/).

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
- Deliberate `MEDEX_PROVIDER=live` guard that throws until an authorized live
  provider is implemented (see DATA_SOURCES.md).
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
