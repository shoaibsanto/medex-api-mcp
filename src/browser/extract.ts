import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";

/**
 * Pure extraction functions: rendered MedEx HTML in, structured records out.
 *
 * Every function here is deterministic and side-effect free so it can be unit
 * tested against saved (mocked) pages without a browser. Selectors were derived
 * from live inspection of medex.com.bd in October 2026 and only read fields
 * the page actually publishes — anything absent comes back null / empty.
 */

export const SITE = "https://medex.com.bd";

/** Extract the numeric id from a MedEx entity URL. */
export function idFromUrl(url: string): string | null {
  const m = url.match(/\/(?:brands|generics|companies|drug-classes)\/(\d+)/);
  return m ? m[1] : null;
}

/** Collapse whitespace in scraped text. */
function clean(s: string | undefined | null): string {
  return (s ?? "").replace(/\s+/g, " ").trim();
}

/** Parse "৳ 1.20" / "৳1.20" into a number; null when absent. */
function parseTaka(s: string | null | undefined): number | null {
  if (!s) return null;
  const m = s.replace(/,/g, "").match(/৳\s*([\d.]+)/);
  if (!m) return null;
  const n = Number.parseFloat(m[1]);
  return Number.isFinite(n) ? n : null;
}

/** Count element matches. */
function count($: cheerio.CheerioAPI, sel: string): number {
  return $(sel).length;
}

// ---------------------------------------------------------------------------
// Search results page
// ---------------------------------------------------------------------------

export interface SearchRow {
  /** "brand" for /brands/ links, "generic" for /generics/ links. */
  kind: "brand" | "generic";
  id: string;
  url: string;
  /** Raw title link text, e.g. "Napa One 1000 mg (Tablet)". */
  title: string;
  /** Following <p> description text, when present. */
  description: string | null;
  /** True when the row is a sponsored/ad row. */
  sponsored: boolean;
}

export interface ParsedSearchPage {
  rows: SearchRow[];
  /** Last page number advertised by the pagination control, when present. */
  lastPage: number | null;
  /** True when the page shows the "no results" state. */
  empty: boolean;
}

/**
 * Parse /search?search=... — rows are `.search-result-row` divs whose title
 * links point at /brands/… or /generics/…; the paragraph under each title
 * carries the generic + manufacturer sentence.
 */
export function parseSearchPage(html: string): ParsedSearchPage {
  const $ = cheerio.load(html);
  const rows: SearchRow[] = [];
  $(".search-result-row").each((_, el) => {
    const titleA = $(el).find(".search-result-title a").first();
    const href = titleA.attr("href");
    if (!href) return;
    const full = href.startsWith("http") ? href : SITE + href;
    const isBrand = /\/brands\//.test(full);
    const isGeneric = /\/generics\//.test(full);
    if (!isBrand && !isGeneric) return;
    const id = idFromUrl(full);
    if (!id) return;
    rows.push({
      kind: isBrand ? "brand" : "generic",
      id,
      url: full,
      title: clean(titleA.text()),
      description: clean($(el).find("p").first().text()) || null,
      sponsored: $(el).hasClass("ad") || $(el).find("span:contains('Sponsored')").length > 0,
    });
  });
  return {
    rows,
    lastPage: lastPageFromPagination($),
    empty: rows.length === 0,
  };
}

/** Max page number advertised by `ul.pagination`, or null. */
function lastPageFromPagination($: cheerio.CheerioAPI): number | null {
  let max: number | null = null;
  $("ul.pagination li a.page-link, ul.pagination li span.page-link").each((_, el) => {
    const n = Number.parseInt(clean($(el).text()), 10);
    if (Number.isFinite(n) && (max === null || n > max)) max = n;
  });
  return max;
}

// ---------------------------------------------------------------------------
// Brand (medicine) detail page
// ---------------------------------------------------------------------------

export interface BrandPageData {
  name: string;
  generic: string | null;
  genericId: string | null;
  strength: string | null;
  dosageForm: string | null;
  manufacturerName: string | null;
  manufacturerId: string | null;
  priceBdt: number | null;
  package: string | null;
  categories: string[];
}

/**
 * Parse /brands/{id}/{slug}. The header block uses `title=` attributes as
 * field labels ("Generic Name", "Strength", "Manufactured by"); price lives in
 * `.package-container`; the therapeutic class sits in the `.ac-body` div that
 * follows `#drug_classes`.
 */
export function parseBrandPage(html: string): BrandPageData {
  const $ = cheerio.load(html);

  // Brand name: h1 minus its <small> dosage-form subtitles.
  const h1 = $("h1.page-heading-1-l").first();
  const nameNode = h1.clone().children("small").remove().end();
  const name = clean(nameNode.text()) || clean(h1.text());

  const genericA = $('div[title="Generic Name"] a').first();
  const genericHref = genericA.attr("href");
  const manufacturerA = $('div[title="Manufactured by"] a.calm-link, div[title="Manufactured by"] a').first();
  const manufacturerHref = manufacturerA.attr("href");

  // Dosage form: icon alt in the header block, else the h1 subtitle.
  const dosageForm =
    $(".brand-th-block img.dosage-icon").attr("alt") ||
    $("h1.page-heading-1-l small[title='Dosage Form']").first().text().trim() ||
    null;

  // Price + package from the first package container.
  const pkg = $(".package-container").first();
  const priceBdt = parseTaka(pkg.find("span").eq(1).text()) ?? parseTaka(pkg.text());
  const packInfo = clean(pkg.find(".pack-size-info").text()).replace(/^\(|\)$/g, "").trim();

  // Therapeutic class: .ac-body immediately after #drug_classes.
  const tcRaw = $("#drug_classes").next(".ac-body").text();
  const categories = tcRaw
    .split("\n")
    .map((s) => clean(s))
    .filter(Boolean);

  return {
    name,
    generic: clean(genericA.text()) || null,
    genericId: genericHref ? idFromUrl(genericHref) : null,
    strength: clean($('div[title="Strength"]').first().text()) || null,
    dosageForm,
    manufacturerName: clean(manufacturerA.text()) || null,
    manufacturerId: manufacturerHref ? idFromUrl(manufacturerHref) : null,
    priceBdt,
    package: packInfo || null,
    categories,
  };
}

// ---------------------------------------------------------------------------
// Generic detail page
// ---------------------------------------------------------------------------

export interface GenericPageData {
  name: string;
  description: string | null;
  brandCount: number;
  /** Brand entries listed under "Available Brand Names". */
  brands: Array<{
    id: string;
    url: string;
    name: string;
    strength: string | null;
    manufacturerName: string | null;
    dosageForm: string | null;
    priceBdt: number | null;
    package: string | null;
  }>;
}

/** Parse /generics/{id}/{slug}: identity, description, and the full brand list. */
export function parseGenericPage(html: string): GenericPageData {
  const $ = cheerio.load(html);
  const name = clean($("h1").first().text());

  // Description: Pharmacology body if present, else Indications.
  let description: string | null = null;
  $("h3.ac-header, h3").each((_, el) => {
    if (description) return;
    const label = clean($(el).text());
    if (label === "Pharmacology" || label === "Indications") {
      const body = clean($(el).next(".ac-body").text());
      if (body) description = body;
    }
  });

  const brands: GenericPageData["brands"] = [];
  $(".available-brands").each((_, el) => {
    const a = $(el).find("a.brand-item, a[href*='/brands/']").first();
    const href = a.attr("href");
    if (!href) return;
    const full = href.startsWith("http") ? href : SITE + href;
    const id = idFromUrl(full);
    if (!id) return;
    brands.push({
      id,
      url: full,
      name: clean($(el).find(".data-row-top").text().replace(/<img[^>]*>/g, "")) || clean(a.text()),
      strength: clean($(el).find(".data-row-strength").text()) || null,
      manufacturerName: clean($(el).find(".data-row-company").text()) || null,
      dosageForm: $(el).find("img.dosage-icon").attr("alt") || null,
      priceBdt: parseTaka($(el).find(".package-pricing").text()),
      package: clean($(el).find(".unit-price").text().split(":")[0]) || null,
    });
  });

  return { name, description, brandCount: brands.length, brands };
}

// ---------------------------------------------------------------------------
// Companies list page
// ---------------------------------------------------------------------------

export interface CompanyListRow {
  id: string;
  url: string;
  name: string;
  /** "751 brand names" parsed from the row subtitle; null when absent. */
  productCount: number | null;
}

export interface ParsedCompanyList {
  rows: CompanyListRow[];
  lastPage: number | null;
}

/** Parse /companies?page=N — each `.row.data-row` holds the name link + counts. */
export function parseCompanyList(html: string): ParsedCompanyList {
  const $ = cheerio.load(html);
  const rows: CompanyListRow[] = [];
  $("div.row.data-row").each((_, el) => {
    const a = $(el).find(".data-row-top a").first();
    const href = a.attr("href");
    if (!href) return;
    const full = href.startsWith("http") ? href : SITE + href;
    const id = idFromUrl(full);
    if (!id) return;
    const sub = clean($(el).children(".col-xs-12").last().text());
    const m = sub.match(/([\d,]+)\s+brand names?/i);
    rows.push({
      id,
      url: full,
      name: clean(a.text()),
      productCount: m ? Number.parseInt(m[1].replace(/,/g, ""), 10) : null,
    });
  });
  return { rows, lastPage: lastPageFromPagination($) };
}

// ---------------------------------------------------------------------------
// Company brands page + company info page
// ---------------------------------------------------------------------------

export interface CompanyBrandsPage {
  companyName: string;
  brands: BrandCard[];
  lastPage: number | null;
}

export interface BrandCard {
  id: string;
  url: string;
  name: string;
  strength: string | null;
  generic: string | null;
  manufacturerName: string | null;
  dosageForm: string | null;
}

/** Parse /companies/{id}/{slug}/brands — the `.brand-card` grid. */
export function parseCompanyBrandsPage(html: string): CompanyBrandsPage {
  const $ = cheerio.load(html);
  const h1 = clean($("h1").first().text());
  const companyName = h1.replace(/\s*Available Brand Names.*$/i, "").trim() || h1;

  const brands: BrandCard[] = [];
  $("a.brand-card").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    const full = href.startsWith("http") ? href : SITE + href;
    const id = idFromUrl(full);
    if (!id) return;
    brands.push({
      id,
      url: full,
      name: clean($(el).find(".brand-card__name").text()),
      strength: clean($(el).find(".brand-card__strength").text()) || null,
      generic: clean($(el).find(".brand-card__generic").text()) || null,
      manufacturerName: clean($(el).find(".brand-card__company").text()) || null,
      dosageForm: $(el).find("img.dosage-icon").attr("alt") || null,
    });
  });
  return { companyName, brands, lastPage: lastPageFromPagination($) };
}

export interface CompanyInfoPage {
  name: string;
  description: string | null;
}

/**
 * Parse a company landing page (/companies/{id}/{slug}). Companies without a
 * dedicated info page redirect straight to their brands page, in which case
 * the name is recovered from the brands-page h1.
 */
export function parseCompanyInfoPage(html: string): CompanyInfoPage {
  const $ = cheerio.load(html);
  const h1 = clean($("h1").first().text());
  const name = h1.replace(/\s*Available Brand Names.*$/i, "").trim() || h1;

  // The info page lists "Established … / Market Share … / Headquarter …"
  // followed by a descriptive paragraph. Take the longest paragraph that is
  // not the generic site chrome.
  let description: string | null = null;
  $("p").each((_, el) => {
    const t = clean($(el).text());
    if (t.length > 80 && !/রোগীর|Disclaimer|Privacy/i.test(t)) {
      if (!description || t.length > description.length) description = t;
    }
  });
  return { name, description };
}

// ---------------------------------------------------------------------------
// Drug classes (categories)
// ---------------------------------------------------------------------------

export interface DrugClassLink {
  id: string;
  url: string;
  name: string;
}

/** Parse /drug-classes — the flat list of top-level classes. */
export function parseDrugClassList(html: string): DrugClassLink[] {
  const $ = cheerio.load(html);
  const out: DrugClassLink[] = [];
  $("a[href*='/drug-classes/']").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    const full = href.startsWith("http") ? href : SITE + href;
    const id = idFromUrl(full);
    const name = clean($(el).text());
    if (!id || !name) return;
    if (!out.some((x) => x.id === id)) out.push({ id, url: full, name });
  });
  return out;
}

export interface DrugClassPage {
  /** Class name recovered from the h1 ("Subclasses of X" / 'Generic list of X'). */
  name: string;
  subclasses: DrugClassLink[];
  generics: Array<{ id: string; url: string; name: string }>;
}

/** Parse /drug-classes/{id}/{slug} — either a subclass list or a generic list. */
export function parseDrugClassPage(html: string): DrugClassPage {
  const $ = cheerio.load(html);
  const h1 = clean($("h1").first().text());
  const name =
    h1.match(/Subclasses of\s+"([^"]+)"/i)?.[1] ||
    h1.match(/Generic list of\s+"([^"]+)"/i)?.[1] ||
    h1;

  const subclasses: DrugClassLink[] = [];
  const generics: DrugClassPage["generics"] = [];
  $("a[href*='/drug-classes/']").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    const full = href.startsWith("http") ? href : SITE + href;
    const id = idFromUrl(full);
    const nm = clean($(el).text());
    if (!id || !nm || id === idFromUrl($("base").attr("href") ?? "")) return;
    if (!subclasses.some((x) => x.id === id)) subclasses.push({ id, url: full, name: nm });
  });
  $("a[href*='/generics/']").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    const full = href.startsWith("http") ? href : SITE + href;
    const id = idFromUrl(full);
    const nm = clean($(el).text());
    if (!id || !nm) return;
    if (!generics.some((x) => x.id === id)) generics.push({ id, url: full, name: nm });
  });
  return { name, subclasses, generics };
}

// ---------------------------------------------------------------------------
// Title-string parsing helper (search rows)
// ---------------------------------------------------------------------------

const UNIT_RE = /^(mcg|µg|ug|mg|g|gm|gram|ml|l|iu|%|billion|million|unit|units|meq|spray|puff)/i;

/**
 * Split a search-row title like "Napa One 1000 mg (Tablet)" into brand name,
 * strength, and dosage form. Best-effort: strength is the shortest suffix that
 * begins with a digit (or "(") and is immediately followed by a unit token.
 * Returns nulls when the title does not decompose.
 */
export function parseBrandTitle(title: string): {
  name: string | null;
  strength: string | null;
  dosageForm: string | null;
} {
  let rest = title.trim();
  let dosageForm: string | null = null;
  const formMatch = rest.match(/\s*\(([^()]*)\)\s*$/);
  if (formMatch && !/\d/.test(formMatch[1])) {
    dosageForm = formMatch[1].trim();
    rest = rest.slice(0, formMatch.index).trim();
  }
  const tokens = rest.split(/\s+/);
  for (let i = 1; i < tokens.length; i++) {
    const tok = tokens[i];
    const startsValue = /^\(?\d/.test(tok);
    if (!startsValue) continue;
    const next = tokens[i + 1] ?? "";
    const tokHasUnit = UNIT_RE.test(tok.replace(/^\(/, ""));
    const nextIsUnit = UNIT_RE.test(next);
    if (tokHasUnit || nextIsUnit) {
      return {
        name: tokens.slice(0, i).join(" "),
        strength: tokens.slice(i).join(" "),
        dosageForm,
      };
    }
  }
  return { name: rest || null, strength: null, dosageForm };
}

/** Count elements — exported for small selector sanity checks in tests. */
export function countElements(html: string, selector: string): number {
  const $ = cheerio.load(html);
  return count($, selector);
}

/** Unused-node guard keeps domhandler types imported for cheerio generics. */
export type CheerioNode = AnyNode;
