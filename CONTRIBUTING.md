# Contributing

Thanks for considering a contribution. This project deals with medicine
information, so a few rules are stricter than usual.

## Ground rules

1. **Never invent clinical data.** Do not add dosages, contraindications, side
   effects, interactions, prices, or clinical claims that are not present in an
   authorized source. Preserve source values and units verbatim.
2. **Never commit secrets.** Use environment variables. Keep `.env` out of git.
   `.env.example` holds placeholders only.
3. **Do not redistribute unauthorized data.** No scraping or republishing of
   MedEx's database. See [DATA_SOURCES.md](DATA_SOURCES.md).
4. **Keep the Provider seam clean.** Routes and MCP tools must depend only on
   the `Provider` interface, never on a concrete implementation.

## Development setup

```bash
npm install
npm run build
npm test
```

Requires Node.js ≥ 20.

## Making a change

1. Fork and create a feature branch.
2. Add or update tests alongside the code — the suite must stay green.
3. If you add an endpoint or tool, update `openapi.yaml`, `API.md`, and
   `MCP.md` in the same commit.
4. Run the full local gate before pushing:

   ```bash
   npm run typecheck
   npm test
   npm run build
   npm audit --audit-level=high
   ```

5. Open a pull request describing the change and its motivation.

## Adding a live provider

If you have obtained written authorization and an official/licensed feed:

1. Implement `Provider` in a new file under `src/provider/`.
2. Wire it into `buildProvider()` behind the `live` case.
3. Populate `SourceAttribution` with `kind: "live"`, the provider name, a
   `sourceUrl`, and `retrievedAt`.
4. Document the authorization basis in `DATA_SOURCES.md`.
5. Add tests that use a **mock** of the live source, not the live source
   itself, so the suite stays hermetic and free of paid API usage.

## Commit style

Use clear, imperative subjects. Group related changes. Do not force-push over
shared history.
