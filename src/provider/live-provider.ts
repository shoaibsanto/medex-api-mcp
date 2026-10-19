import type { Medicine, Generic, Manufacturer, Category, Paginated, Single } from "../types.js";
import type { Provider, SearchQuery, ListQuery } from "./provider.js";
import { BrowserSession, NavigationError } from "../browser/session.js";
import {
  SITE,
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
} from "../browser/extract.js";

/**
 * LiveProvider retrieves medicine information by driving a real headless
 * browser against medex.com.bd at request time.
 *
 * Guarantees:
 *  - No database, cache, or persisted dataset. Every request performs fresh
 *    page navigations; only the browser process is reused.
 *  - No synthetic data. When a page fails to load or a field is absent, the
 *    call either returns null/empty for that field or throws a
 *    NavigationError — it never substitutes fixture records.
 *  - Politeness: navigations are serialized with a minimum delay (see
 *    BrowserSession) and only public pages are read. No authentication,
 *    CAPTCHA, or access-control bypass is attempted; if MedEx blocks or rate
 *    limits the client, the error is surfaced verbatim.
 */

export const LIVE_PROVIDER_NAME = "medex-live";
export const LIVE_PROVIDER_DISPLAY = "MedEx Bangladesh (live browser)";

/** How many generic pages list_category_medicines may expand per call. */
const DEFAULT_CATEGORY_EXPANSIONS = 8;
/** How many subclass pages list_category_medicines may descend per call. */
const SUBCLASS_PAGE_BUDGET = 6;

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function splitIngredients(generic: string): string[] {
  return generic
    .split(/\s*\+\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Extract "(Generic) is manufactured by Company" from a search description. */
function parseSearchDescription(desc: string | null): { generic: string | null; manufacturer: string | null } {
  if (!desc) return { generic: null, manufacturer: null };
  const m = desc.match(/\(([^)]+)\)\s+is\s+(?:manufactured|marketed)\s+by\s+(.+?)\s*$/i);
  if (!m) return { generic: null, manufacturer: null };
  return { generic: m[1].trim(), manufacturer: m[2].trim() };
}

export class LiveProvider implements Provider {
  readonly name = LIVE_PROVIDER_NAME;
  readonly displayName = LIVE_PROVIDER_DISPLAY;
  readonly isLive = true;

  private readonly session: BrowserSession;
  private readonly categoryExpansions: number;

  constructor(session?: BrowserSession) {
    this.session =
      session ??
      new BrowserSession({
        minDelayMs: envInt("MEDEX_REQUEST_DELAY_MS", 1200),
        navigationTimeoutMs: envInt("MEDEX_NAV_TIMEOUT_MS", 30_000),
        executablePath: process.env.MEDEX_BROWSER_EXECUTABLE || undefined,
      });
    this.categoryExpansions = envInt("MEDEX_CATEGORY_MAX_EXPANSIONS", DEFAULT_CATEGORY_EXPANSIONS);
  }

  /** Release the browser. Safe to call more than once. */
  async close(): Promise<void> {
    await this.session.close();
  }

  private attribution(sourceUrl: string, retrievedAt: string) {
    return {
      provider: LIVE_PROVIDER_NAME,
      providerName: LIVE_PROVIDER_DISPLAY,
      kind: "live" as const,
      sourceUrl,
      retrievedAt,
    };
  }

  /** Rethrow 404 as null (record not found); everything else propagates. */
  private static nullOn404(err: unknown): null {
    if (err instanceof NavigationError && err.kind === "http" && err.statusCode === 404) return null;
    throw err;
  }

  // -------------------------------------------------------------------------
  // Medicines
  // -------------------------------------------------------------------------

  async searchMedicines(query: SearchQuery): Promise<Paginated<Medicine>> {
    const q = query.q.trim();
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const url = `${SITE}/search?search=${encodeURIComponent(q)}&page=${page}`;
    const nav = await this.session.navigate(url);
    const parsed = parseSearchPage(nav.html);
    const source = this.attribution(nav.url, nav.retrievedAt);

    const brandRows = parsed.rows.filter((r) => r.kind === "brand");
    const seen = new Set<string>();
    const data: Medicine[] = [];
    for (const row of brandRows) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      const t = parseBrandTitle(row.title);
      const { generic, manufacturer } = parseSearchDescription(row.description);
      data.push({
        id: row.id,
        name: t.name ?? row.title,
        generic: generic ?? "",
        activeIngredients: generic ? splitIngredients(generic) : [],
        strength: t.strength,
        dosageForm: t.dosageForm ?? "Other",
        manufacturerId: null,
        manufacturerName: manufacturer,
        package: null,
        priceBdt: null,
        categories: [],
        source: this.attribution(row.url, nav.retrievedAt),
      });
      if (data.length >= limit) break;
    }

    const hasMoreSitePages = parsed.lastPage !== null ? page < parsed.lastPage : brandRows.length >= 20;
    return {
      data,
      meta: {
        page,
        limit,
        total: parsed.empty ? 0 : -1,
        totalPages: parsed.lastPage ?? -1,
        hasNext: hasMoreSitePages,
        hasPrev: page > 1,
        totalExact: parsed.empty,
        note: parsed.empty
          ? undefined
          : "MedEx search pages do not publish a total result count; totals are unknown (-1). " +
            `Only the ${data.length} brand rows from search page ${page} are returned (price/package live on the brand page, not the search page).`,
        query: q,
      },
      source,
    };
  }

  async getMedicine(id: string): Promise<Single<Medicine> | null> {
    if (!/^\d+$/.test(id)) return null;
    let nav;
    try {
      nav = await this.session.navigate(`${SITE}/brands/${id}`);
    } catch (err) {
      return LiveProvider.nullOn404(err);
    }
    const p = parseBrandPage(nav.html);
    if (!p.name) throw new NavigationError(`MedEx brand page ${nav.url} has no recognizable header`, nav.url, "unknown");
    return {
      data: {
        id,
        name: p.name,
        generic: p.generic ?? "",
        activeIngredients: p.generic ? splitIngredients(p.generic) : [],
        strength: p.strength,
        dosageForm: p.dosageForm ?? "Other",
        manufacturerId: p.manufacturerId,
        manufacturerName: p.manufacturerName,
        package: p.package,
        priceBdt: p.priceBdt,
        categories: p.categories,
        source: this.attribution(nav.url, nav.retrievedAt),
      },
      source: this.attribution(nav.url, nav.retrievedAt),
    };
  }

  // -------------------------------------------------------------------------
  // Generics
  // -------------------------------------------------------------------------

  async searchGenerics(query: SearchQuery): Promise<Paginated<Generic>> {
    const q = query.q.trim();
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const url = `${SITE}/search?search=${encodeURIComponent(q)}&page=${page}`;
    const nav = await this.session.navigate(url);
    const parsed = parseSearchPage(nav.html);
    const source = this.attribution(nav.url, nav.retrievedAt);

    const rows = parsed.rows.filter((r) => r.kind === "generic");
    const seen = new Set<string>();
    const data: Generic[] = [];
    for (const row of rows) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      data.push({
        id: row.id,
        name: row.title,
        activeIngredients: splitIngredients(row.title),
        description: row.description,
        brandCount: null,
        source: this.attribution(row.url, nav.retrievedAt),
      });
      if (data.length >= limit) break;
    }

    return {
      data,
      meta: {
        page,
        limit,
        total: parsed.empty ? 0 : -1,
        totalPages: parsed.lastPage ?? -1,
        hasNext: parsed.lastPage !== null ? page < parsed.lastPage : rows.length >= 20,
        hasPrev: page > 1,
        totalExact: parsed.empty,
        note: parsed.empty
          ? undefined
          : "Search results do not publish totals; brandCount is unknown here (open the generic page for the real list).",
        query: q,
      },
      source,
    };
  }

  async getGeneric(id: string): Promise<Single<Generic> | null> {
    if (!/^\d+$/.test(id)) return null;
    let nav;
    try {
      nav = await this.session.navigate(`${SITE}/generics/${id}`);
    } catch (err) {
      return LiveProvider.nullOn404(err);
    }
    const p = parseGenericPage(nav.html);
    if (!p.name) throw new NavigationError(`MedEx generic page ${nav.url} has no recognizable header`, nav.url, "unknown");
    return {
      data: {
        id,
        name: p.name,
        activeIngredients: splitIngredients(p.name),
        description: p.description,
        brandCount: p.brandCount,
        source: this.attribution(nav.url, nav.retrievedAt),
      },
      source: this.attribution(nav.url, nav.retrievedAt),
    };
  }

  // -------------------------------------------------------------------------
  // Manufacturers
  // -------------------------------------------------------------------------

  async listManufacturers(query: ListQuery): Promise<Paginated<Manufacturer>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const url = `${SITE}/companies?page=${page}`;
    const nav = await this.session.navigate(url);
    const parsed = parseCompanyList(nav.html);
    const source = this.attribution(nav.url, nav.retrievedAt);

    const needle = query.q?.trim().toLowerCase();
    const filtered = needle ? parsed.rows.filter((r) => r.name.toLowerCase().includes(needle)) : parsed.rows;
    const data: Manufacturer[] = filtered.slice(0, limit).map((r) => ({
      id: r.id,
      name: r.name,
      description: null,
      website: null,
      productCount: r.productCount,
      source: this.attribution(r.url, nav.retrievedAt),
    }));

    return {
      data,
      meta: {
        page,
        limit,
        total: -1,
        totalPages: parsed.lastPage ?? -1,
        hasNext: parsed.lastPage !== null ? page < parsed.lastPage : parsed.rows.length >= 20,
        hasPrev: page > 1,
        totalExact: false,
        note: needle
          ? `Name filter "${query.q}" is applied to page ${page} of the alphabetical company list only.`
          : "MedEx does not publish a company total; totals are unknown (-1).",
        ...(query.q !== undefined ? { query: query.q } : {}),
      },
      source,
    };
  }

  async getManufacturer(id: string): Promise<Single<Manufacturer> | null> {
    if (!/^\d+$/.test(id)) return null;
    let nav;
    try {
      nav = await this.session.navigate(`${SITE}/companies/${id}`);
    } catch (err) {
      return LiveProvider.nullOn404(err);
    }
    const p = parseCompanyInfoPage(nav.html);
    if (!p.name) throw new NavigationError(`MedEx company page ${nav.url} has no recognizable header`, nav.url, "unknown");

    // Some company pages publish "N brand names" in prose; try to capture it.
    const brandCountMatch = nav.html.match(/([\d,]+)\s+brand names?/i);
    const productCount = brandCountMatch ? Number.parseInt(brandCountMatch[1].replace(/,/g, ""), 10) : null;

    return {
      data: {
        id,
        name: p.name,
        description: p.description,
        website: null,
        productCount: Number.isFinite(productCount as number) ? productCount : null,
        source: this.attribution(nav.url, nav.retrievedAt),
      },
      source: this.attribution(nav.url, nav.retrievedAt),
    };
  }

  async listManufacturerMedicines(id: string, query: ListQuery): Promise<Paginated<Medicine>> {
    if (!/^\d+$/.test(id)) return this.emptyMedicinePage(query);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    // Step 1: resolve the canonical company URL (id-only URLs redirect).
    const landing = await this.session.navigate(`${SITE}/companies/${id}`).catch((err) => {
      if (err instanceof NavigationError && err.kind === "http" && err.statusCode === 404) return null;
      throw err;
    });
    if (!landing) return this.emptyMedicinePage(query);

    let brandsUrl = landing.url.replace(/\/$/, "");
    if (!brandsUrl.endsWith("/brands")) brandsUrl += "/brands";

    // Step 2: fetch the requested brands page.
    const nav =
      page === 1
        ? landing.url.endsWith("/brands")
          ? landing
          : await this.session.navigate(brandsUrl)
        : await this.session.navigate(`${brandsUrl}?page=${page}`);

    const parsed = parseCompanyBrandsPage(nav.html);
    const source = this.attribution(nav.url, nav.retrievedAt);

    const needle = query.q?.trim().toLowerCase();
    let cards = parsed.brands;
    if (needle) cards = cards.filter((c) => c.name.toLowerCase().includes(needle));
    const data: Medicine[] = cards.slice(0, limit).map((c) => ({
      id: c.id,
      name: c.name,
      generic: c.generic ?? "",
      activeIngredients: c.generic ? splitIngredients(c.generic) : [],
      strength: c.strength,
      dosageForm: c.dosageForm ?? "Other",
      manufacturerId: id,
      manufacturerName: c.manufacturerName ?? parsed.companyName,
      package: null,
      priceBdt: null,
      categories: [],
      source: this.attribution(c.url, nav.retrievedAt),
    }));

    return {
      data,
      meta: {
        page,
        limit,
        total: -1,
        totalPages: parsed.lastPage ?? -1,
        hasNext: parsed.lastPage !== null ? page < parsed.lastPage : parsed.brands.length >= 25,
        hasPrev: page > 1,
        totalExact: false,
        note: "Company brand listings are paginated by MedEx; totals are unknown (-1). Prices live on individual brand pages.",
        ...(query.q !== undefined ? { query: query.q } : {}),
      },
      source,
    };
  }

  private emptyMedicinePage(query: ListQuery): Paginated<Medicine> {
    return {
      data: [],
      meta: {
        page: query.page ?? 1,
        limit: query.limit ?? 20,
        total: 0,
        totalPages: 1,
        hasNext: false,
        hasPrev: false,
        totalExact: true,
      },
      source: {
        provider: LIVE_PROVIDER_NAME,
        providerName: LIVE_PROVIDER_DISPLAY,
        kind: "live",
      },
    };
  }

  // -------------------------------------------------------------------------
  // Categories (drug classes)
  // -------------------------------------------------------------------------

  async listCategories(query: ListQuery): Promise<Paginated<Category>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const nav = await this.session.navigate(`${SITE}/drug-classes`);
    const classes = parseDrugClassList(nav.html);
    const source = this.attribution(nav.url, nav.retrievedAt);

    const needle = query.q?.trim().toLowerCase();
    const filtered = needle ? classes.filter((c) => c.name.toLowerCase().includes(needle)) : classes;
    const start = (page - 1) * limit;
    const data: Category[] = filtered.slice(start, start + limit).map((c) => ({
      id: c.id,
      name: c.name,
      medicineCount: null,
      description: null,
      source: this.attribution(c.url, nav.retrievedAt),
    }));

    const totalPages = Math.max(1, Math.ceil(filtered.length / limit));
    return {
      data,
      meta: {
        page,
        limit,
        total: filtered.length,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
        totalExact: true,
        note: "Top-level therapeutic classes only; medicineCount is not published on the list page.",
        ...(query.q !== undefined ? { query: query.q } : {}),
      },
      source,
    };
  }

  async getCategory(id: string): Promise<Single<Category> | null> {
    if (!/^\d+$/.test(id)) return null;
    let nav;
    try {
      nav = await this.session.navigate(`${SITE}/drug-classes/${id}`);
    } catch (err) {
      return LiveProvider.nullOn404(err);
    }
    const p = parseDrugClassPage(nav.html);
    return {
      data: {
        id,
        name: p.name,
        medicineCount: null,
        description: null,
        source: this.attribution(nav.url, nav.retrievedAt),
      },
      source: this.attribution(nav.url, nav.retrievedAt),
    };
  }

  /**
   * A drug-class page lists generics (leaf) or subclasses (branch), never
   * brands directly. To honour the "medicine brands" contract we descend
   * bounded subclass pages to reach generics, then expand a capped number of
   * generic pages (each yields its full brand list). The cap keeps a single
   * call to a polite number of upstream requests; meta.note reports it.
   */
  async listCategoryMedicines(id: string, query: ListQuery): Promise<Paginated<Medicine>> {
    if (!/^\d+$/.test(id)) return this.emptyMedicinePage(query);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    let landing;
    try {
      landing = await this.session.navigate(`${SITE}/drug-classes/${id}`);
    } catch (err) {
      if (LiveProvider.nullOn404(err) === null) return this.emptyMedicinePage(query);
      throw err;
    }

    const cls = parseDrugClassPage(landing.html);
    const categoryName = cls.name;
    const source = this.attribution(landing.url, landing.retrievedAt);

    // Collect generics: direct leaf, or descend subclasses within a budget.
    let generics = cls.generics.map((g) => ({ ...g, page: landing }));
    let subclassPagesUsed = 0;
    let frontier = cls.subclasses;
    while (generics.length === 0 && frontier.length > 0 && subclassPagesUsed < SUBCLASS_PAGE_BUDGET) {
      const next = frontier.shift()!;
      subclassPagesUsed++;
      const nav = await this.session.navigate(next.url);
      const sub = parseDrugClassPage(nav.html);
      generics.push(...sub.generics.map((g) => ({ ...g, page: nav })));
      frontier.push(...sub.subclasses);
    }

    if (generics.length === 0) {
      return {
        data: [],
        meta: {
          page,
          limit,
          total: 0,
          totalPages: 1,
          hasNext: false,
          hasPrev: false,
          totalExact: true,
          note: `No generics found under category "${categoryName}" within the subclass search budget.`,
        },
        source,
      };
    }

    // Expand a bounded number of generic pages into brand lists.
    const expansions = Math.min(this.categoryExpansions, generics.length);
    const brands: Medicine[] = [];
    let expanded = 0;
    let exhaustedAll = true;
    for (const g of generics) {
      if (expanded >= expansions) {
        exhaustedAll = false;
        break;
      }
      expanded++;
      const gnav = g.page && g.page.url.includes(`/generics/${g.id}`) ? g.page : await this.session.navigate(g.url);
      const gp = parseGenericPage(gnav.html);
      for (const b of gp.brands) {
        brands.push({
          id: b.id,
          name: b.name,
          generic: gp.name || g.name,
          activeIngredients: splitIngredients(gp.name || g.name),
          strength: b.strength,
          dosageForm: b.dosageForm ?? "Other",
          manufacturerId: null,
          manufacturerName: b.manufacturerName,
          package: b.package,
          priceBdt: b.priceBdt,
          categories: [categoryName],
          source: this.attribution(b.url, gnav.retrievedAt),
        });
      }
    }

    const needle = query.q?.trim().toLowerCase();
    const filtered = needle ? brands.filter((m) => m.name.toLowerCase().includes(needle)) : brands;
    const start = (page - 1) * limit;
    const slice = filtered.slice(start, start + limit);
    const totalPages = Math.max(1, Math.ceil(filtered.length / limit));

    return {
      data: slice,
      meta: {
        page,
        limit,
        total: filtered.length,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
        totalExact: exhaustedAll,
        note:
          `Category "${categoryName}": expanded ${expanded} of ${generics.length} generics (cap ${expansions}, ` +
          `subclass pages visited: ${subclassPagesUsed}).` +
          (exhaustedAll ? "" : " Increase MEDEX_CATEGORY_MAX_EXPANSIONS for fuller coverage."),
        ...(query.q !== undefined ? { query: query.q } : {}),
      },
      source,
    };
  }
}

/** Re-exported for tests and the API layer. */
export { NavigationError };
export { idFromUrl };
