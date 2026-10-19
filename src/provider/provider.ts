import type { Medicine, Generic, Manufacturer, Category, Paginated, Single } from "../types.js";

/** Query accepted by medicine/generic search endpoints. */
export interface SearchQuery {
  q: string;
  page?: number;
  limit?: number;
}

/** Options accepted by list endpoints. */
export interface ListQuery {
  page?: number;
  limit?: number;
  /** Optional filter: only items whose name contains this substring. */
  q?: string;
}

/**
 * Provider is the seam between the API business logic and the data source.
 *
 * The API layer depends only on this interface. Concrete implementations:
 *   - FixtureProvider  — synthetic development data (default, no auth needed)
 *   - (future) LiveProvider — an authorized upstream feed
 *
 * Keeping this boundary narrow means swapping in an authorized live provider
 * requires no changes to routes, validation, or the MCP server.
 */
export interface Provider {
  /** Stable machine name of this provider instance. */
  readonly name: string;
  /** Human-readable provider name used in source attribution. */
  readonly displayName: string;
  /** Whether this provider returns real (authorized) data. */
  readonly isLive: boolean;

  searchMedicines(query: SearchQuery): Promise<Paginated<Medicine>>;
  getMedicine(id: string): Promise<Single<Medicine> | null>;

  searchGenerics(query: SearchQuery): Promise<Paginated<Generic>>;
  getGeneric(id: string): Promise<Single<Generic> | null>;

  listManufacturers(query: ListQuery): Promise<Paginated<Manufacturer>>;
  getManufacturer(id: string): Promise<Single<Manufacturer> | null>;
  listManufacturerMedicines(id: string, query: ListQuery): Promise<Paginated<Medicine>>;

  listCategories(query: ListQuery): Promise<Paginated<Category>>;
  getCategory(id: string): Promise<Single<Category> | null>;
  listCategoryMedicines(id: string, query: ListQuery): Promise<Paginated<Medicine>>;
}
