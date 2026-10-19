# Data Sources & Authorization

This document is the authoritative statement on where this project's data comes
from and what is / is not authorized. Read it before using or extending this
software.

## Summary

| Question | Answer |
|---|---|
| Does this project serve live MedEx data? | **Yes**, on demand, via headless-browser navigation of medex.com.bd. |
| Does it redistribute MedEx's database? | **No.** Nothing is bulk-downloaded, stored, or republished. |
| Does it use an official MedEx API? | **No official API exists.** Pages are navigated and parsed at request time. |
| Is there a database or local dataset? | **No.** The live path reads no persistent store. |
| What else can it serve? | An explicit offline **fixture mode** for development/tests only. |

## The source and how it is accessed

- **Source:** `https://medex.com.bd` — a public, freely accessible Bangladeshi
  pharmaceutical product directory (brand pages, generic monographs, company
  listings, therapeutic drug classes).
- **Access method:** Every tool call drives a headless browser (Playwright with
  locally installed Chrome/Edge/Chromium) through the site's own pages:
  `/search`, `/brands/{id}`, `/generics/{id}`, `/companies[...]`,
  `/drug-classes[...]`.
- **On demand only:** One tool call = one or a few page navigations, separated
  by a politeness delay. There is **no scheduled crawling, no bulk download,
  no caching of extracted records, and no database**.

### What was checked before automating access

- **`/robots.txt`** — `User-agent: *` with an empty `Disallow`; permissive for
  crawling the paths this server reads. Note that `robots.txt` governs
  *access control*, not copyright or database rights.
- **Terms of service** — `/terms` returns 404. No ToS page was found.
- **About page** — `/about` returns 404.
- **Privacy policy** — exists at `/privacy-policy`, but covers only personal
  data handling. It says nothing about licensing the medicine database.
- **Official API** — `/api` and `/api/v1` return 404. No public API
  documentation was found.
- **Sitemap** — `/sitemap.xml` returns 404.

### Responsible-access posture

There is **no official API, no published licensing terms, and no written
authorization** for automated collection from MedEx. Consequently this project:

1. **Does not bypass** authentication, CAPTCHAs, or access controls, and uses
   no credentials or sessions.
2. **Does not bulk-download, store, or republish** MedEx content — it reads
   pages at request time, at human-like volume, and serves only the fields
   visible on the page.
3. **Obeys upstream signals** — 403/429/5xx surface as explicit
   `NavigationError`/`LiveAccessError`s; the provider never retries around a
   block or substitutes other data for it.
4. **Rate-limits itself** — configurable minimum delay between navigations
   (`MEDEX_REQUEST_DELAY_MS`, default 1200 ms), single in-flight navigation per
   process.
5. **Labels every record** with `source.kind: "live"`, the exact page URL, and
   a retrieval timestamp.

> This is not legal advice, and "robots.txt permits it" is not a license. The
> operator is responsible for confirming their usage complies with MedEx's
> terms and any applicable database/copyright rights. If the site's terms or
> robots.txt change to restrict this access, **stop using the live provider**.

## Field availability and honesty rules

The live provider returns **only fields actually published on the source page**.
It never invents, rounds, or copies values across records. Unparseable pages
are errors, not empty successes; missing fields are `null`.

| Field | Where it comes from |
|---|---|
| `name`, `strength`, `dosageForm` | Brand page header, or the search row's title text. |
| `generic`, `activeIngredients`, `genericId` | Brand page's "Generic Name" link; splitting on `+` is a structural decomposition of the published string. |
| `manufacturerName`, `manufacturerId` | "Manufactured by" link, or the company brands page. |
| `priceBdt`, `package` | Brand page package block; **`null` on search rows and company brand cards, where no price is published**. |
| `categories` | "Therapeutic Class" section; empty when the page omits it. |
| `description` (generics) | Indications/Pharmacology text; `null` when absent. |
| `brandCount` (generics) | Count of brand links in "Available Brand Names"; `null` when absent. |
| `productCount` (companies) | Published "N brand names" figure; `null` on info pages without it. |
| `medicineCount` (categories) | `null` — the drug-classes index does not publish counts. |
| `source.sourceUrl`, `source.retrievedAt` | The exact page URL fetched + navigation timestamp, on every record. |

### Pagination caveat

MedEx paginates listings server-side and does not publish total result counts
on search results or company listings. The live provider therefore reports
`meta.totalExact: false` with `meta.total: -1` (unknown) where the site gives
no total, `meta.totalPages` from the site's own last-page link (or `-1` when
undeterminable), and a `meta.note` where a bound applies (e.g. category
expansion is capped by `MEDEX_CATEGORY_MAX_EXPANSIONS`, default 8).

## The fixture dataset (offline development only)

`fixtures/medex-fixtures.json` contains **fictional records**:

- **Fictional brands** (e.g. "Paracetamol 500 mg Tablet (Fixture)").
- **Fictional manufacturers** (e.g. "Fixture Pharma Ltd.", "Sample Biotech
  Ltd.").
- **Illustrative prices and packages** that are not real market values.

Fixture mode (`MEDEX_PROVIDER=fixture`) exists so the API and MCP server can be
developed and tested offline. Every fixture record carries
`source.kind: "fixture"` and `providerName: "Synthetic Development Fixtures"`,
so consumers can always tell fixture data apart. The generic compound names
(e.g. Paracetamol, Amoxicillin) are widely known INNs used only to make the
test data structurally realistic; they carry **no clinical claims, dosages,
contraindications, interactions, or dosing instructions**.

**Never represent fixture records as live medicine data**, and never run the
fixture provider in production. The live provider has no import of, or
fallback to, the fixture dataset — a failed live request returns an explicit
error (asserted by `tests/live-provider.test.ts`).

## Adding another provider

If an authorized feed becomes available:

1. Implement the `Provider` interface (`src/provider/provider.ts`).
2. Preserve source values and units verbatim. Do not unit-convert,
   re-interpret, or add clinical claims.
3. Populate `SourceAttribution` with the real provider name, `kind: "live"`, a
   `sourceUrl`, and a `retrievedAt` timestamp.
4. Return `priceBdt: null` when the source omits a price — never invent one.
5. Wire it into `buildProvider()` behind a new explicit case.
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
