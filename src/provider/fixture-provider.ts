import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type {
  Medicine,
  Generic,
  Manufacturer,
  Category,
  Paginated,
  Single,
  SourceAttribution,
} from "../types.js";
import type { Provider, SearchQuery, ListQuery } from "./provider.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Raw shape of the fixture file (medicine rows embed relational ids). */
interface FixtureFile {
  generatedAt: string;
  medicines: Array<Omit<Medicine, "source">>;
  generics: Array<Omit<Generic, "source" | "brandCount"> & { medicines: string[] }>;
  manufacturers: Array<Omit<Manufacturer, "source" | "productCount">>;
  categories: Array<Omit<Category, "source" | "medicineCount">>;
}

const DEFAULT_FIXTURE_PATH = resolve(__dirname, "../../fixtures/medex-fixtures.json");

function paginate<T>(items: T[], page: number, limit: number, query?: string): Paginated<T> {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * limit;
  const data = items.slice(start, start + limit);
  return {
    data,
    meta: {
      page: safePage,
      limit,
      total,
      totalPages,
      hasNext: safePage < totalPages,
      hasPrev: safePage > 1,
      ...(query !== undefined ? { query } : {}),
    },
    source: FIXTURE_SOURCE,
  };
}

/** Shared source attribution stamped on every fixture response. */
const FIXTURE_SOURCE: SourceAttribution = {
  provider: "fixture",
  providerName: "Synthetic Development Fixtures",
  kind: "fixture",
};

function matches(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

/**
 * FixtureProvider serves synthetic development data loaded from
 * fixtures/medex-fixtures.json. It is the default provider so the API and MCP
 * server work out of the box with zero credentials and zero network access.
 *
 * It is deliberately NOT live data. See DATA_SOURCES.md for how to supply an
 * authorized live provider.
 */
export class FixtureProvider implements Provider {
  readonly name = "fixture";
  readonly displayName = "Synthetic Development Fixtures";
  readonly isLive = false;

  private medicines: Medicine[];
  private generics: (Generic & { medicineIds: string[] })[];
  private manufacturers: (Manufacturer & { medicineIds: string[] })[];
  private categories: (Category & { medicineIds: string[] })[];

  constructor(fixturePath: string = DEFAULT_FIXTURE_PATH) {
    const raw = JSON.parse(readFileSync(fixturePath, "utf8")) as FixtureFile;

    const stamp = (): SourceAttribution => ({
      ...FIXTURE_SOURCE,
      retrievedAt: raw.generatedAt,
    });

    this.medicines = raw.medicines.map((m) => ({ ...m, source: stamp() }));

    // Build reverse indexes from medicine -> manufacturer / category.
    const byManufacturer = new Map<string, string[]>();
    const byCategory = new Map<string, string[]>();
    for (const m of this.medicines) {
      (byManufacturer.get(m.manufacturerId) ?? byManufacturer.set(m.manufacturerId, []).get(m.manufacturerId)!).push(m.id);
      for (const c of m.categories) {
        (byCategory.get(c) ?? byCategory.set(c, []).get(c)!).push(m.id);
      }
    }

    this.generics = raw.generics.map((g) => ({
      id: g.id,
      name: g.name,
      activeIngredients: g.activeIngredients,
      description: g.description,
      brandCount: g.medicines.length,
      medicineIds: g.medicines,
      source: stamp(),
    }));

    this.manufacturers = raw.manufacturers.map((mf) => ({
      id: mf.id,
      name: mf.name,
      description: mf.description,
      website: mf.website,
      productCount: byManufacturer.get(mf.id)?.length ?? 0,
      medicineIds: byManufacturer.get(mf.id) ?? [],
      source: stamp(),
    }));

    this.categories = raw.categories.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      medicineCount: byCategory.get(c.id)?.length ?? 0,
      medicineIds: byCategory.get(c.id) ?? [],
      source: stamp(),
    }));
  }

  private medicineById(id: string): Medicine | undefined {
    return this.medicines.find((m) => m.id === id);
  }

  async searchMedicines(query: SearchQuery): Promise<Paginated<Medicine>> {
    const q = query.q.trim();
    let results = this.medicines;
    if (q) {
      results = results.filter(
        (m) =>
          matches(m.name, q) ||
          matches(m.generic, q) ||
          m.activeIngredients.some((a) => matches(a, q)) ||
          matches(m.manufacturerName, q),
      );
    }
    return paginate(results, query.page ?? 1, query.limit ?? 20, q);
  }

  async getMedicine(id: string): Promise<Single<Medicine> | null> {
    const m = this.medicineById(id);
    return m ? { data: m, source: m.source } : null;
  }

  async searchGenerics(query: SearchQuery): Promise<Paginated<Generic>> {
    const q = query.q.trim();
    let results: Generic[] = this.generics;
    if (q) {
      results = results.filter(
        (g) => matches(g.name, q) || g.activeIngredients.some((a) => matches(a, q)),
      );
    }
    return paginate(results, query.page ?? 1, query.limit ?? 20, q);
  }

  async getGeneric(id: string): Promise<Single<Generic> | null> {
    const g = this.generics.find((x) => x.id === id);
    return g ? { data: g, source: g.source } : null;
  }

  async listManufacturers(query: ListQuery): Promise<Paginated<Manufacturer>> {
    let results: Manufacturer[] = this.manufacturers;
    if (query.q) {
      results = results.filter((m) => matches(m.name, query.q!));
    }
    return paginate(results, query.page ?? 1, query.limit ?? 20, query.q);
  }

  async getManufacturer(id: string): Promise<Single<Manufacturer> | null> {
    const m = this.manufacturers.find((x) => x.id === id);
    return m ? { data: m, source: m.source } : null;
  }

  async listManufacturerMedicines(id: string, query: ListQuery): Promise<Paginated<Medicine>> {
    const mf = this.manufacturers.find((x) => x.id === id);
    if (!mf) return paginate<Medicine>([], query.page ?? 1, query.limit ?? 20, query.q);
    let results = mf.medicineIds
      .map((mid) => this.medicineById(mid))
      .filter((m): m is Medicine => Boolean(m));
    if (query.q) {
      results = results.filter((m) => matches(m.name, query.q!));
    }
    return paginate(results, query.page ?? 1, query.limit ?? 20, query.q);
  }

  async listCategories(query: ListQuery): Promise<Paginated<Category>> {
    let results: Category[] = this.categories;
    if (query.q) {
      results = results.filter((c) => matches(c.name, query.q!));
    }
    return paginate(results, query.page ?? 1, query.limit ?? 20, query.q);
  }

  async getCategory(id: string): Promise<Single<Category> | null> {
    const c = this.categories.find((x) => x.id === id);
    return c ? { data: c, source: c.source } : null;
  }

  async listCategoryMedicines(id: string, query: ListQuery): Promise<Paginated<Medicine>> {
    const cat = this.categories.find((x) => x.id === id);
    if (!cat) return paginate<Medicine>([], query.page ?? 1, query.limit ?? 20, query.q);
    let results = cat.medicineIds
      .map((mid) => this.medicineById(mid))
      .filter((m): m is Medicine => Boolean(m));
    if (query.q) {
      results = results.filter((m) => matches(m.name, query.q!));
    }
    return paginate(results, query.page ?? 1, query.limit ?? 20, query.q);
  }
}
