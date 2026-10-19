/**
 * Core domain types for the MedEx API.
 *
 * All types model the shape of medicine information as published by the
 * upstream source (MedEx Bangladesh). Field names mirror the source so that
 * values and units are preserved verbatim — nothing is unit-converted,
 * re-scaled, or clinically interpreted here.
 */

/** Identifies where a record came from and whether it is live or synthetic. */
export interface SourceAttribution {
  /** Stable identifier of the data provider (e.g. "medex"). */
  provider: string;
  /** Human-readable name of the provider. */
  providerName: string;
  /** Canonical URL of the source record, when one exists. */
  sourceUrl?: string;
  /**
   * "fixture" records are synthetic development data used when no authorized
   * live provider is configured. "live" records come from an authorized
   * upstream feed. Consumers must never treat fixture data as clinical truth.
   */
  kind: "fixture" | "live";
  /** ISO-8601 timestamp the record was last updated at the source, if known. */
  retrievedAt?: string;
}

/** Common envelope fields present on every catalog record. */
export interface BaseRecord {
  id: string;
  name: string;
  source: SourceAttribution;
}

export type DosageForm =
  | "Tablet"
  | "Capsule"
  | "Syrup"
  | "Suspension"
  | "Injection"
  | "Cream"
  | "Ointment"
  | "Drops"
  | "Inhaler"
  | "Nasal Spray"
  | "Oral Solution"
  | "Gel"
  | "Sachet"
  | "Suppository"
  | "Other";

/** A single sellable product unit: one brand at one strength in one form. */
export interface Medicine extends BaseRecord {
  /** Generic (INN) name of the active ingredient(s), verbatim. */
  generic: string;
  /** Active ingredient(s), verbatim from the source. */
  activeIngredients: string[];
  /** Strength value as written at the source (e.g. "500 mg", "500 mg/5 ml"). */
  strength: string;
  dosageForm: DosageForm;
  /** Manufacturer / company id, resolvable via the manufacturers endpoint. */
  manufacturerId: string;
  /** Manufacturer display name, verbatim. */
  manufacturerName: string;
  /** Package description as written at the source (e.g. "Strip of 10 tablets"). */
  package: string;
  /** Unit price in BDT when published; null when the source omits it. */
  priceBdt: number | null;
  /** Therapeutic / ATC-style classification labels, verbatim when present. */
  categories: string[];
}

/** An active ingredient / generic entity that groups many brands. */
export interface Generic extends BaseRecord {
  /** Active ingredient(s) that define this generic, verbatim. */
  activeIngredients: string[];
  /** Short description of the class, verbatim when present; else null. */
  description: string | null;
  /** Number of brand products known to the provider for this generic. */
  brandCount: number;
}

/** A pharmaceutical manufacturer / company. */
export interface Manufacturer extends BaseRecord {
  /** Short description, verbatim when present; else null. */
  description: string | null;
  /** Website URL when the source publishes one; else null. */
  website: string | null;
  /** Number of brand products known to the source for this manufacturer. */
  productCount: number;
}

/** A therapeutic / classification category grouping medicines. */
export interface Category extends BaseRecord {
  /** Number of brand products known to the source in this category. */
  medicineCount: number;
  /** Longer description, verbatim when present; else null. */
  description: string | null;
}

/** Standard pagination metadata attached to list responses. */
export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

/** Standard envelope for paginated list responses. */
export interface Paginated<T> {
  data: T[];
  meta: PageMeta & {
    /** Echo of any query applied, for reproducibility. */
    query?: string;
  };
  source: SourceAttribution;
}

/** Standard envelope for single-record responses. */
export interface Single<T> {
  data: T;
  source: SourceAttribution;
}

/** Consistent error body for all non-2xx responses. */
export interface ApiError {
  error: {
    /** Machine-readable code (e.g. "not_found", "validation_error"). */
    code: string;
    /** Human-readable message. */
    message: string;
    /** Optional per-field validation problems. */
    details?: Array<{ field: string; issue: string }>;
  };
}

/** Health / readiness payload. */
export interface HealthStatus {
  status: "ok" | "degraded";
  version: string;
  provider: {
    name: string;
    kind: "fixture" | "live";
    /** True when a live, authorized provider is backing the API. */
    live: boolean;
  };
  uptimeSeconds: number;
  timestamp: string;
}
