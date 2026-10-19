import { describe, it, expect, vi } from "vitest";
import { LiveProvider } from "../src/provider/live-provider.js";
import { BrowserSession, NavigationError, type NavigationResult } from "../src/browser/session.js";

/**
 * LiveProvider behaviour tests using a FAKE browser session.
 *
 * The fake returns saved MOCK pages (synthetic HTML mimicking medex.com.bd's
 * structure) and records which URLs were requested. No network, no browser,
 * and no live MedEx data are involved — these tests verify plumbing, error
 * propagation, and that no fixture data leaks into the live path.
 */

const SEARCH_HTML = `
<html><body>
  <div class="search-result-row">
    <div class="search-result-title">
      <img class="dosage-icon" alt="Tablet">
      <a href="https://medex.com.bd/brands/28639/napa-one-1000-mg-tablet">Napa One 1000 mg (Tablet)</a>
    </div>
    <p>Napa One 1000 mg <i>(Paracetamol)</i> is manufactured by Beximco Pharmaceuticals Ltd.</p>
  </div>
  <div class="search-result-row">
    <div class="search-result-title">
      <a href="https://medex.com.bd/generics/860/paracetamol">Paracetamol</a>
    </div>
    <p>A mock generic description.</p>
  </div>
  <ul class="pagination">
    <li class="page-item active"><span class="page-link">1</span></li>
    <li class="page-item"><a class="page-link" href="?page=2">2</a></li>
  </ul>
</body></html>
`;

const EMPTY_SEARCH_HTML = `<html><body><h2>Showing results matching keyword "zzz"</h2></body></html>`;

const BRAND_HTML = `
<html><body>
  <div class="brand-header">
    <div class="brand-th-block"><img class="dosage-icon" alt="Tablet">
      <h1 class="page-heading-1-l brand">Napa One <small class="h1-subtitle" title="Dosage Form">Tablet</small></h1>
    </div>
    <div title="Generic Name"><a href="https://medex.com.bd/generics/860/paracetamol">Paracetamol</a></div>
    <div title="Strength">1000 mg</div>
    <div title="Manufactured by"><a class="calm-link" href="https://medex.com.bd/companies/149/beximco/brands">Beximco Pharmaceuticals Ltd.</a></div>
  </div>
  <div class="package-container">
    <span>Unit Price: </span><span>৳ 1.50</span>
    <span class="pack-size-info"> (10 x 10: ৳ 150.00) </span>
  </div>
  <div><div id="drug_classes"><h3 class="ac-header">Therapeutic Class</h3></div>
  <div class="ac-body"> Non-Opioid Analgesics </div></div>
</body></html>
`;

const GENERIC_HTML = `
<html><body>
  <h1>Paracetamol</h1>
  <h3 class="ac-header">Pharmacology</h3>
  <div class="ac-body">Mock pharmacology body.</div>
  <div class="available-brands">
    <a class="brand-item" href="https://medex.com.bd/brands/27175/a-one-120-mg-oral-suspension">
      <li class="data-row"><div class="data-row-top"><img class="dosage-icon" alt="Oral Suspension"> A-One </div>
      <div class="data-row-strength">120 mg/5 ml</div><div class="data-row-company">Apex Pharma Ltd.</div>
      <div class="package-container"><span class="unit-price">60 ml : <span class="package-pricing">৳ 35.00</span></span></div></li>
    </a>
  </div>
</body></html>
`;

const COMPANY_LIST_HTML = `
<html><body>
  <div class="row data-row">
    <div class="col-xs-12 data-row-top"><a href="https://medex.com.bd/companies/3/acme">ACME Laboratories Ltd.</a></div>
    <div class="col-xs-12">448 generics, 751 brand names</div>
  </div>
  <ul class="pagination"><li class="page-item active"><span>1</span></li></ul>
</body></html>
`;

const COMPANY_BRANDS_HTML = `
<html><body>
  <h1>ACME Laboratories Ltd Available Brand Names</h1>
  <a class="brand-card" href="https://medex.com.bd/brands/1001/a-cal-500-mg-tablet">
    <div class="brand-card__name-row"><img class="dosage-icon" alt="Tablet"><span class="brand-card__name">A-Cal</span></div>
    <div class="brand-card__strength">500 mg</div>
    <div class="brand-card__generic">Calcium Carbonate</div>
    <div class="brand-card__company">ACME Laboratories Ltd.</div>
  </a>
</body></html>
`;

const DRUG_CLASSES_HTML = `
<html><body>
  <h1>Drug Classes</h1>
  <a class="hoverable-block" href="https://medex.com.bd/drug-classes/17">Musculoskeletal systems</a>
</body></html>
`;

const CLASS_SUBCLASS_HTML = `
<html><body>
  <h1>Subclasses of "Musculoskeletal systems"</h1>
  <a href="https://medex.com.bd/drug-classes/465/nsaids">NSAIDs</a>
</body></html>
`;

const CLASS_LEAF_HTML = `
<html><body>
  <h1>Generic list of "NSAIDs"</h1>
  <a class="hoverable-block darker" href="https://medex.com.bd/generics/3/aceclofenac">Aceclofenac</a>
</body></html>
`;

/** A fake BrowserSession that serves canned pages and records requests. */
class FakeSession {
  readonly requested: string[] = [];
  private readonly routes: Array<{ match: RegExp; html: string | null; status?: number }>;

  constructor(routes: Array<{ match: RegExp; html: string | null; status?: number }>) {
    this.routes = routes;
  }

  navigate(url: string): Promise<NavigationResult> {
    this.requested.push(url);
    for (const r of this.routes) {
      if (r.match.test(url)) {
        if (r.html === null) {
          const status = r.status ?? 404;
          return Promise.reject(
            new NavigationError(`HTTP ${status}`, url, status === 404 ? "http" : "blocked", status),
          );
        }
        return Promise.resolve({ url, status: 200, html: r.html, retrievedAt: "2026-10-19T00:00:00.000Z" });
      }
    }
    return Promise.reject(new NavigationError(`unrouted ${url}`, url, "unknown"));
  }

  async close(): Promise<void> {
    /* nothing to release */
  }
}

type Route = { match: RegExp; html: string | null; status?: number };

function provider(routes: Route[]): LiveProvider {
  return new LiveProvider(new FakeSession(routes) as unknown as BrowserSession);
}

const ALL_ROUTES: Route[] = [
  { match: /\/search\?search=napa/, html: SEARCH_HTML },
  { match: /\/search\?search=zzz/, html: EMPTY_SEARCH_HTML },
  { match: /\/brands\/28639/, html: BRAND_HTML },
  { match: /\/brands\/999999/, html: null },
  { match: /\/generics\/860/, html: GENERIC_HTML },
  { match: /\/generics\/3/, html: `<html><body><h1>Aceclofenac</h1></body></html>` },
  { match: /\/companies\?page=/, html: COMPANY_LIST_HTML },
  { match: /\/companies\/3\/brands/, html: COMPANY_BRANDS_HTML },
  { match: /\/companies\/3$/, html: `<html><body><h1>ACME Laboratories Ltd Available Brand Names</h1></body></html>` },
  { match: /\/drug-classes\?/, html: DRUG_CLASSES_HTML },
  { match: /\/drug-classes$/, html: DRUG_CLASSES_HTML },
  { match: /\/drug-classes\/465/, html: CLASS_LEAF_HTML },
  { match: /\/drug-classes\/17/, html: CLASS_SUBCLASS_HTML },
];

describe("LiveProvider identity", () => {
  it("reports itself as a live provider", () => {
    const p = provider(ALL_ROUTES);
    expect(p.isLive).toBe(true);
    expect(p.name).toBe("medex-live");
  });
});

describe("LiveProvider.searchMedicines", () => {
  it("returns brand rows with live source attribution and no fabricated prices", async () => {
    const p = provider(ALL_ROUTES);
    const res = await p.searchMedicines({ q: "napa" });
    expect(res.data.length).toBe(1);
    const m = res.data[0];
    expect(m.id).toBe("28639");
    expect(m.name).toBe("Napa One");
    expect(m.strength).toBe("1000 mg");
    expect(m.generic).toBe("Paracetamol");
    expect(m.manufacturerName).toBe("Beximco Pharmaceuticals Ltd.");
    // Search rows do not carry price/package — they must be null, not invented.
    expect(m.priceBdt).toBeNull();
    expect(m.package).toBeNull();
    expect(m.source.kind).toBe("live");
    expect(m.source.sourceUrl).toContain("/brands/28639");
    expect(res.meta.total).toBe(-1);
    expect(res.meta.hasNext).toBe(true);
  });

  it("returns an empty page (total 0) for no matches", async () => {
    const p = provider(ALL_ROUTES);
    const res = await p.searchMedicines({ q: "zzz" });
    expect(res.data).toHaveLength(0);
    expect(res.meta.total).toBe(0);
    expect(res.meta.totalExact).toBe(true);
  });
});

describe("LiveProvider.getMedicine", () => {
  it("navigates the brand page and extracts every published field", async () => {
    const fake = new FakeSession(ALL_ROUTES);
    const p = new LiveProvider(fake as unknown as BrowserSession);
    const res = await p.getMedicine("28639");
    expect(res).not.toBeNull();
    expect(res!.data.name).toBe("Napa One");
    expect(res!.data.priceBdt).toBe(1.5);
    expect(res!.data.package).toBe("10 x 10: ৳ 150.00");
    expect(res!.data.categories).toEqual(["Non-Opioid Analgesics"]);
    expect(res!.source.kind).toBe("live");
    // Exactly one navigation for one lookup.
    expect(fake.requested).toEqual(["https://medex.com.bd/brands/28639"]);
  });

  it("returns null on 404 instead of fabricating a record", async () => {
    const p = provider(ALL_ROUTES);
    expect(await p.getMedicine("999999")).toBeNull();
  });

  it("returns null for non-numeric ids without navigating", async () => {
    const fake = new FakeSession(ALL_ROUTES);
    const p = new LiveProvider(fake as unknown as BrowserSession);
    expect(await p.getMedicine("med-0001")).toBeNull();
    expect(fake.requested).toHaveLength(0);
  });

  it("propagates non-404 navigation failures as errors (no fallback data)", async () => {
    const p = provider([{ match: /\/brands\/\d+/, html: null, status: 403 }]);
    await expect(p.getMedicine("28639")).rejects.toThrow(/403/);
  });
});

describe("LiveProvider.searchGenerics", () => {
  it("filters search rows down to generics", async () => {
    const p = provider(ALL_ROUTES);
    const res = await p.searchGenerics({ q: "napa" });
    expect(res.data.length).toBe(1);
    expect(res.data[0].id).toBe("860");
    expect(res.data[0].name).toBe("Paracetamol");
    expect(res.data[0].brandCount).toBeNull();
  });
});

describe("LiveProvider.getGeneric", () => {
  it("counts the listed brands and lifts the description", async () => {
    const p = provider(ALL_ROUTES);
    const res = await p.getGeneric("860");
    expect(res!.data.name).toBe("Paracetamol");
    expect(res!.data.brandCount).toBe(1);
    expect(res!.data.description).toBe("Mock pharmacology body.");
  });

  it("returns null on 404", async () => {
    const p = provider([{ match: /\/generics\/\d+/, html: null }]);
    expect(await p.getGeneric("999")).toBeNull();
  });
});

describe("LiveProvider manufacturers", () => {
  it("lists companies with published brand counts", async () => {
    const p = provider(ALL_ROUTES);
    const res = await p.listManufacturers({});
    expect(res.data[0].id).toBe("3");
    expect(res.data[0].productCount).toBe(751);
    expect(res.data[0].description).toBeNull();
  });

  it("lists a manufacturer's medicines via the brands page", async () => {
    const p = provider(ALL_ROUTES);
    const res = await p.listManufacturerMedicines("3", {});
    expect(res.data.length).toBe(1);
    expect(res.data[0].name).toBe("A-Cal");
    expect(res.data[0].manufacturerId).toBe("3");
    expect(res.data[0].priceBdt).toBeNull();
  });

  it("returns an empty page for an unknown manufacturer", async () => {
    const p = provider([{ match: /\/companies\/\d+/, html: null }]);
    const res = await p.listManufacturerMedicines("999", {});
    expect(res.data).toHaveLength(0);
    expect(res.meta.total).toBe(0);
  });
});

describe("LiveProvider categories", () => {
  it("lists drug classes", async () => {
    const p = provider(ALL_ROUTES);
    const res = await p.listCategories({});
    expect(res.data[0].id).toBe("17");
    expect(res.data[0].name).toBe("Musculoskeletal systems");
    expect(res.data[0].medicineCount).toBeNull();
  });

  it("descends subclasses then expands generics into brands", async () => {
    const fake = new FakeSession(ALL_ROUTES);
    const p = new LiveProvider(fake as unknown as BrowserSession);
    const res = await p.listCategoryMedicines("17", {});
    // subclass 17 -> leaf 465 -> generic 3 (no brands page in routes, so 0 brands)
    expect(res.data).toHaveLength(0);
    expect(res.meta.total).toBe(0);
    expect(fake.requested[0]).toContain("/drug-classes/17");
    expect(fake.requested[1]).toContain("/drug-classes/465");
  });

  it("surfaces brands when the generic page is routed", async () => {
    const routes = [
      { match: /\/drug-classes\/9$/, html: `<html><body><h1>Generic list of "Mock class"</h1><a href="https://medex.com.bd/generics/860/paracetamol">Paracetamol</a></body></html>` },
      { match: /\/generics\/860/, html: GENERIC_HTML },
    ];
    const p = provider(routes);
    const res = await p.listCategoryMedicines("9", {});
    expect(res.data.length).toBe(1);
    expect(res.data[0].name).toBe("A-One");
    expect(res.data[0].categories).toEqual(["Mock class"]);
    expect(res.data[0].priceBdt).toBe(35.0);
    expect(res.data[0].source.kind).toBe("live");
  });
});

describe("LiveProvider never serves fixture data", () => {
  it("has no code path that reads the fixture dataset", async () => {
    // A provider wired to a session that fails EVERY request must throw on
    // every lookup — it must never return fixture records.
    const failing = new FakeSession([]);
    const p = new LiveProvider(failing as unknown as BrowserSession);
    await expect(p.searchMedicines({ q: "paracetamol" })).rejects.toThrow();
    await expect(p.getMedicine("28639")).rejects.toThrow();
    await expect(p.getGeneric("860")).rejects.toThrow();
    await expect(p.listManufacturers({})).rejects.toThrow();
    await expect(p.listCategories({})).rejects.toThrow();
  });
});
