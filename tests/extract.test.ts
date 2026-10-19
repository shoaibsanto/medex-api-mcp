import { describe, it, expect } from "vitest";
import {
  parseSearchPage,
  parseBrandPage,
  parseGenericPage,
  parseCompanyList,
  parseCompanyBrandsPage,
  parseCompanyInfoPage,
  parseDrugClassList,
  parseDrugClassPage,
  parseBrandTitle,
  idFromUrl,
} from "../src/browser/extract.js";

/**
 * Unit tests for the extraction layer, run against MOCKED HTML fragments.
 *
 * The markup below mimics the structure of medex.com.bd pages as inspected in
 * October 2026. It is synthetic test markup, NOT live MedEx data, and exists
 * only to verify the parsers without a browser or network.
 */

const MOCK_SEARCH_PAGE = `
<html><body>
  <h2>Showing results matching keyword "napa"</h2>
  <div class="search-result-row">
    <div class="search-result-title">
      <img class="dosage-icon" alt="Tablet">
      <a href="https://medex.com.bd/brands/28639/napa-one-1000-mg-tablet">Napa One 1000 mg (Tablet)</a>
    </div>
    <p>Napa One 1000 mg <i>(Paracetamol)</i> is manufactured by Beximco Pharmaceuticals Ltd.</p>
  </div>
  <div class="search-result-row ad">
    <div class="search-result-title">
      <a href="https://medex.com.bd/brands/9001/sponsored-tab">Sponsored Tab 50 mg (Tablet)</a>
      <span>Sponsored</span>
    </div>
    <p>Sponsored Tab 50 mg <i>(Mock substance)</i> is manufactured by Sponsored Pharma.</p>
  </div>
  <div class="search-result-row">
    <div class="search-result-title">
      <a href="https://medex.com.bd/generics/860/paracetamol">Paracetamol</a>
    </div>
    <p>Mock description of the generic used for parser testing.</p>
  </div>
  <div class="search-result-row">
    <div class="search-result-title">
      <a href="https://medex.com.bd/brands/28639/napa-one-1000-mg-tablet">Napa One 1000 mg (Tablet)</a>
    </div>
    <p>Duplicate row to test de-duplication.</p>
  </div>
  <ul class="pagination">
    <li class="page-item active"><span class="page-link">1</span></li>
    <li class="page-item"><a class="page-link" href="http://medex.com.bd/search?search=napa&page=2">2</a></li>
    <li class="page-item"><a class="page-link" href="http://medex.com.bd/search?search=napa&page=3">3</a></li>
  </ul>
</body></html>
`;

const MOCK_EMPTY_SEARCH = `
<html><body>
  <h2>Showing results matching keyword "zzz"</h2>
</body></html>
`;

const MOCK_BRAND_PAGE = `
<html><body>
  <div class="brand-header">
    <div class="d-flex v-center mb-6 brand-th-block">
      <span><img alt="Tablet" class="dosage-icon"></span>
      <h1 class="page-heading-1-l brand">Paradil Extra
        <small class="h1-subtitle" title="Dosage Form">Tablet</small>
      </h1>
    </div>
    <div title="Generic Name"><a href="https://medex.com.bd/generics/861/paracetamol-caffeine">Paracetamol + Caffeine</a></div>
    <div title="Strength">500 mg+65 mg</div>
    <div title="Manufactured by">
      <a href="https://medex.com.bd/companies/102/biogen-pharmaceuticals-ltd/brands" class="calm-link">Biogen Pharmaceuticals Ltd.</a>
    </div>
  </div>
  <div class="package-container mt-5 mb-5">
    <span style="color: #3a5571;">Unit Price: </span>
    <span>৳ 2.00</span>
    <span class="pack-size-info"> (10 x 10: ৳ 200.00) </span>
    <div><span>Strip Price:</span><span>৳ 20.00</span></div>
  </div>
  <div>
    <div id="drug_classes"><h3 class="ac-header">Therapeutic Class</h3></div>
    <div class="ac-body"> Non-Opioid Analgesics </div>
  </div>
</body></html>
`;

const MOCK_GENERIC_PAGE = `
<html><body>
  <h1>Paracetamol</h1>
  <h3 class="ac-header">Indications</h3>
  <div class="ac-body">Mock indications text for parser testing only.</div>
  <h3 class="ac-header">Pharmacology</h3>
  <div class="ac-body">Mock pharmacology description for parser testing.</div>
  <h3 class="ac-header">Available Brand Names</h3>
  <div class="col-xs-12 col-sm-6 available-brands cid8">
    <a class="hoverable-block brand-item" href="https://medex.com.bd/brands/27175/a-one-120-mg-oral-suspension">
      <li class="data-row">
        <div class="data-row-top"><img class="dosage-icon" alt="Oral Suspension"> A-One </div>
        <div class="data-row-strength">120 mg/5 ml</div>
        <div class="data-row-company">Apex Pharma Ltd.</div>
        <div class="packages-wrapper"><div class="package-container">
          <span class="unit-price">60 ml bottle : <span class="package-pricing">৳ 35.00</span></span>
        </div></div>
      </li>
    </a>
  </div>
  <div class="col-xs-12 col-sm-6 available-brands cid73">
    <a class="hoverable-block brand-item" href="https://medex.com.bd/brands/10377/ace-500-mg-tablet">
      <li class="data-row">
        <div class="data-row-top"><img class="dosage-icon" alt="Tablet"> Ace </div>
        <div class="data-row-strength">500 mg</div>
        <div class="data-row-company">ACME Ltd.</div>
        <div class="packages-wrapper"><div class="package-container">
          <span class="unit-price">10's : <span class="package-pricing">৳ 12.00</span></span>
        </div></div>
      </li>
    </a>
  </div>
</body></html>
`;

const MOCK_COMPANY_LIST = `
<html><body>
  <h1>List of Pharmaceutical Companies</h1>
  <div class="row data-row">
    <div class="col-xs-12 data-row-top"><a href="https://medex.com.bd/companies/3/acme-laboratories-ltd">ACME Laboratories Ltd.</a></div>
    <div class="col-xs-12">448 generics, 751 brand names</div>
  </div>
  <div class="row data-row">
    <div class="col-xs-12 data-row-top"><a href="https://medex.com.bd/companies/103/ad-din/brands">Ad-din Pharmaceuticals Ltd.</a></div>
    <div class="col-xs-12">83 generics, 128 brand names</div>
  </div>
  <ul class="pagination">
    <li class="page-item active"><span class="page-link">1</span></li>
    <li class="page-item"><a class="page-link" href="http://medex.com.bd/companies?page=2">2</a></li>
  </ul>
</body></html>
`;

const MOCK_COMPANY_BRANDS = `
<html><body>
  <h1>Pristine Pharmaceuticals Ltd Available Brand Names</h1>
  <div class="brand-list-grid">
    <a href="https://medex.com.bd/brands/37389/aceclofenac-200-mg-sr-tablet" class="brand-card">
      <div class="brand-card__name-row"><img class="dosage-icon" alt="Tablet (Sustained Release)"><span class="brand-card__name">Aceclofenac</span></div>
      <div class="brand-card__strength">200 mg</div>
      <div class="brand-card__generic">Aceclofenac</div>
      <div class="brand-card__company">Pristine Pharmaceuticals Ltd</div>
    </a>
    <a href="https://medex.com.bd/brands/10377/ace-500-mg-tablet" class="brand-card">
      <div class="brand-card__name-row"><img class="dosage-icon" alt="Tablet"><span class="brand-card__name">Ace</span></div>
      <div class="brand-card__strength">500 mg</div>
      <div class="brand-card__generic">Aceclofenac</div>
      <div class="brand-card__company">Pristine Pharmaceuticals Ltd</div>
    </a>
  </div>
  <ul class="pagination">
    <li class="page-item active"><span class="page-link">1</span></li>
    <li class="page-item"><a class="page-link" href="http://medex.com.bd/x?page=2">2</a></li>
  </ul>
</body></html>
`;

const MOCK_COMPANY_INFO = `
<html><body>
  <h1>ACME Laboratories Ltd.</h1>
  <p>Established 1954. Market Share 3.70%. Total generics 545.</p>
  <p>The ACME Laboratories Ltd. is a mock leading company paragraph used only to verify that the parser picks up the longest descriptive paragraph from a company info page during unit tests.</p>
</body></html>
`;

const MOCK_DRUG_CLASS_LIST = `
<html><body>
  <h1>Drug Classes</h1>
  <div class="col-xs-12 col-sm-6"><a class="hoverable-block" href="https://medex.com.bd/drug-classes/1">Allergy & immune system</a></div>
  <div class="col-xs-12 col-sm-6"><a class="hoverable-block" href="https://medex.com.bd/drug-classes/17">Musculoskeletal systems</a></div>
</body></html>
`;

const MOCK_DRUG_CLASS_SUBCLASS = `
<html><body>
  <h1>Subclasses of "Musculoskeletal systems"</h1>
  <a href="https://medex.com.bd/drug-classes/465/non-steroidal-anti-inflammatory-drugs-nsaids">Non-steroidal Anti-inflammatory Drugs (NSAIDs)</a>
</body></html>
`;

const MOCK_DRUG_CLASS_LEAF = `
<html><body>
  <h1>Generic list of "Non-steroidal Anti-inflammatory Drugs (NSAIDs)"</h1>
  <a class="hoverable-block darker" href="https://medex.com.bd/generics/3/aceclofenac">Aceclofenac</a>
  <a class="hoverable-block darker" href="https://medex.com.bd/generics/21/acemetacin">Acemetacin</a>
</body></html>
`;

describe("idFromUrl", () => {
  it("extracts numeric ids from entity URLs", () => {
    expect(idFromUrl("https://medex.com.bd/brands/37397/paracetamol-500-mg-tablet")).toBe("37397");
    expect(idFromUrl("https://medex.com.bd/generics/860/paracetamol")).toBe("860");
    expect(idFromUrl("https://medex.com.bd/companies/391/pristine/brands")).toBe("391");
    expect(idFromUrl("https://medex.com.bd/drug-classes/465/nsaids")).toBe("465");
    expect(idFromUrl("https://medex.com.bd/search?search=x")).toBeNull();
  });
});

describe("parseSearchPage", () => {
  it("parses brand and generic rows, flags sponsored rows, and reads pagination", () => {
    const p = parseSearchPage(MOCK_SEARCH_PAGE);
    expect(p.rows.length).toBe(4);
    const brand = p.rows[0];
    expect(brand.kind).toBe("brand");
    expect(brand.id).toBe("28639");
    expect(brand.title).toBe("Napa One 1000 mg (Tablet)");
    expect(brand.description).toContain("Beximco");
    expect(p.rows[1].sponsored).toBe(true);
    expect(p.rows[2].kind).toBe("generic");
    expect(p.lastPage).toBe(3);
    expect(p.empty).toBe(false);
  });

  it("detects the empty state", () => {
    const p = parseSearchPage(MOCK_EMPTY_SEARCH);
    expect(p.rows).toHaveLength(0);
    expect(p.empty).toBe(true);
    expect(p.lastPage).toBeNull();
  });
});

describe("parseBrandTitle", () => {
  it("splits name, strength, and dosage form", () => {
    expect(parseBrandTitle("Napa One 1000 mg (Tablet)")).toEqual({
      name: "Napa One",
      strength: "1000 mg",
      dosageForm: "Tablet",
    });
    expect(parseBrandTitle("Paradil Extra 500 mg+65 mg (Tablet)")).toEqual({
      name: "Paradil Extra",
      strength: "500 mg+65 mg",
      dosageForm: "Tablet",
    });
    expect(parseBrandTitle("Napa Extend 665 mg (XR Tablet)")).toEqual({
      name: "Napa Extend",
      strength: "665 mg",
      dosageForm: "XR Tablet",
    });
  });

  it("keeps brand names that start with digits intact", () => {
    const r = parseBrandTitle("3 Bion 100 mg+200 mg+200 mcg (Tablet)");
    expect(r.name).toBe("3 Bion");
    expect(r.strength).toBe("100 mg+200 mg+200 mcg");
  });

  it("handles strengthless titles", () => {
    const r = parseBrandTitle("Isabgul Plus (Powder)");
    expect(r.name).toBe("Isabgul Plus");
    expect(r.strength).toBeNull();
    expect(r.dosageForm).toBe("Powder");
  });
});

describe("parseBrandPage", () => {
  it("extracts header fields, price, package, and therapeutic class", () => {
    const p = parseBrandPage(MOCK_BRAND_PAGE);
    expect(p.name).toBe("Paradil Extra");
    expect(p.generic).toBe("Paracetamol + Caffeine");
    expect(p.genericId).toBe("861");
    expect(p.strength).toBe("500 mg+65 mg");
    expect(p.dosageForm).toBe("Tablet");
    expect(p.manufacturerName).toBe("Biogen Pharmaceuticals Ltd.");
    expect(p.manufacturerId).toBe("102");
    expect(p.priceBdt).toBe(2.0);
    expect(p.package).toBe("10 x 10: ৳ 200.00");
    expect(p.categories).toEqual(["Non-Opioid Analgesics"]);
  });
});

describe("parseGenericPage", () => {
  it("extracts name, description, and brand list with prices", () => {
    const p = parseGenericPage(MOCK_GENERIC_PAGE);
    expect(p.name).toBe("Paracetamol");
    expect(p.description).toBe("Mock indications text for parser testing only.");
    expect(p.brandCount).toBe(2);
    expect(p.brands[0].id).toBe("27175");
    expect(p.brands[0].name).toBe("A-One");
    expect(p.brands[0].strength).toBe("120 mg/5 ml");
    expect(p.brands[0].manufacturerName).toBe("Apex Pharma Ltd.");
    expect(p.brands[0].dosageForm).toBe("Oral Suspension");
    expect(p.brands[0].priceBdt).toBe(35.0);
    expect(p.brands[0].package).toBe("60 ml bottle");
  });
});

describe("parseCompanyList", () => {
  it("parses rows with brand counts and pagination", () => {
    const p = parseCompanyList(MOCK_COMPANY_LIST);
    expect(p.rows.length).toBe(2);
    expect(p.rows[0].id).toBe("3");
    expect(p.rows[0].name).toBe("ACME Laboratories Ltd.");
    expect(p.rows[0].productCount).toBe(751);
    expect(p.lastPage).toBe(2);
  });
});

describe("parseCompanyBrandsPage", () => {
  it("parses the brand-card grid", () => {
    const p = parseCompanyBrandsPage(MOCK_COMPANY_BRANDS);
    expect(p.companyName).toBe("Pristine Pharmaceuticals Ltd");
    expect(p.brands.length).toBe(2);
    expect(p.brands[0].name).toBe("Aceclofenac");
    expect(p.brands[0].strength).toBe("200 mg");
    expect(p.brands[0].dosageForm).toBe("Tablet (Sustained Release)");
    expect(p.lastPage).toBe(2);
  });
});

describe("parseCompanyInfoPage", () => {
  it("takes the longest descriptive paragraph", () => {
    const p = parseCompanyInfoPage(MOCK_COMPANY_INFO);
    expect(p.name).toBe("ACME Laboratories Ltd.");
    expect(p.description).toContain("mock leading company paragraph");
  });
});

describe("parseDrugClassList", () => {
  it("collects unique class links", () => {
    const p = parseDrugClassList(MOCK_DRUG_CLASS_LIST);
    expect(p.length).toBe(2);
    expect(p[0]).toMatchObject({ id: "1", name: "Allergy & immune system" });
  });
});

describe("parseDrugClassPage", () => {
  it("recognizes subclass pages", () => {
    const p = parseDrugClassPage(MOCK_DRUG_CLASS_SUBCLASS);
    expect(p.name).toBe("Musculoskeletal systems");
    expect(p.subclasses.length).toBe(1);
    expect(p.generics.length).toBe(0);
  });

  it("recognizes leaf (generic list) pages", () => {
    const p = parseDrugClassPage(MOCK_DRUG_CLASS_LEAF);
    expect(p.name).toBe("Non-steroidal Anti-inflammatory Drugs (NSAIDs)");
    expect(p.generics.length).toBe(2);
    expect(p.generics[0].id).toBe("3");
  });
});
