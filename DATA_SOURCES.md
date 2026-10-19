# Data Sources & Authorization

This document is the authoritative statement on where this project's data comes
from and what is / is not authorized. Read it before using or extending this
software.

## Summary

| Question | Answer |
|---|---|
| Does this project serve live MedEx data? | **No.** |
| Does it redistribute MedEx's database? | **No.** |
| What does it serve by default? | **Synthetic development fixtures.** |
| Is an official MedEx API used? | **No official API exists.** |
| Is scraping/redistribution authorized? | **No written authorization exists.** |

## What was checked

Before implementing anything, the following were inspected on `medex.com.bd`:

- **`/robots.txt`** — `User-agent: *` with an empty `Disallow`. This is
  permissive for *crawling*, but `robots.txt` governs **access control**, not
  copyright or database rights. It is not a license to copy or republish.
- **Terms of service** — `/terms` returns 404. No ToS page was found.
- **About page** — `/about` returns 404.
- **Privacy policy** — exists at `/privacy-policy`, but covers only personal
  data handling (accounts, cookies, analytics). It says nothing about licensing
  the medicine database for redistribution or automated access.
- **Official API** — `/api` and `/api/v1` return 404. No public API
  documentation was found.
- **Sitemap** — `/sitemap.xml` returns 404.

## Conclusion

There is **no official API**, **no published licensing terms**, and **no written
authorization** to automate collection of, or redistribute, MedEx's medicine
database. The site's permissive `robots.txt` permits crawling for indexing but
does not grant redistribution rights.

Therefore, following responsible-access practice, this project:

1. **Does not scrape, bulk-download, or republish** MedEx content.
2. **Does not ship** any copy of MedEx's database, proprietary content, or
   restricted datasets.
3. Ships with a **synthetic fixture provider** so the API and MCP server can be
   developed, tested, and demonstrated offline.

## The fixture dataset

`fixtures/medex-fixtures.json` contains **fictional records**:

- **Fictional brands** (e.g. "Paracetamol 500 mg Tablet (Fixture)").
- **Fictional manufacturers** (e.g. "Fixture Pharma Ltd.", "Sample Biotech
  Ltd.").
- **Illustrative prices and packages** that are not real market values.

Each record carries a `source` object with `kind: "fixture"` and
`providerName: "Synthetic Development Fixtures"`, so consumers can always tell
fixture data apart from real data. The generic compound names (e.g. Paracetamol,
Amoxicillin) are widely known international non-proprietary names used only to
make the test data structurally realistic; they carry **no clinical claims,
dosages, contraindications, interactions, or dosing instructions**.

**Never represent fixture records as verified live medicine data.**

## Why `MEDEX_PROVIDER=live` throws

The provider factory (`src/provider/index.ts`) deliberately **throws** when
`MEDEX_PROVIDER=live` is set, rather than silently returning fixture data. This
prevents a misconfiguration from presenting synthetic records as if they were
authorized live data.

## How to add an authorized live provider

If you obtain written authorization and an official or licensed feed:

1. Implement the `Provider` interface (`src/provider/provider.ts`) — e.g.
   `src/provider/live-provider.ts`.
2. Preserve source values and units verbatim. Do not unit-convert,
   re-interpret, or add clinical claims.
3. Populate `SourceAttribution` with the real provider name, `kind: "live"`, a
   `sourceUrl`, and a `retrievedAt` timestamp.
4. Return `priceBdt: null` when the source omits a price — never invent one.
5. Wire it into `buildProvider()` behind the `live` case.
6. Update this document with the authorization basis.

## Medical-information safeguards

Independently of the data source, this project:

- Does **not** invent dosages, contraindications, side effects, interactions,
  prices, or clinical claims.
- Preserves source values and units verbatim.
- Distinguishes brand names from generic names and active ingredients.
- Includes source attribution and freshness metadata on every record.
- Clearly distinguishes fixture (synthetic) from live information.
- Is **not** a substitute for professional medical advice.
