/**
 * Core domain types for the MedEx API.
 *
 * All types model the shape of medicine information as published by the
 * upstream source (MedEx Bangladesh). Field names mirror the source so that
 * values and units are preserved verbatim — nothing is unit-converted,
 * re-scaled, or clinically interpreted here.
 *
 * Fields the upstream page does not publish are `null` (or an empty array for
 * list fields). The live browser provider fills only what a page actually
 * shows; it never invents values.
 */

/** Identifies where a record came from and whether it is live or synthetic. */
export interface SourceAttribution {
  /** Stable identifier of the data provider (e.g. "medex-live"). */
  provider: string;
  /** Human-readable name of the provider. */
  providerName: string;
  /** Canonical URL of the source record, when one exists. */
  sourceUrl?: string;
  /**
   * "fixture" records are synthetic development data used only when the
   * fixture provider is explicitly selected (tests / offline demos).
   * "live" records are retrieved on demand from the live MedEx website via
   * browser automation. Consumers must never treat fixture data as clinical
   * truth.
   */
  kind: "fixture" | "live";
  /** ISO-8601 timestamp the record was retrieved from the source. */
  retrievedAt?: string;
}

/** Common envelope fields present on every catalog record. */
export interface BaseRecord {
  id: string;
  name: string;
  source: SourceAttribution;
}

/**
 * Dosage form, verbatim from the source (e.g. "Tablet", "Oral Suspension",
 * "Tablet (Sustained Release)"). MedEx publishes more form labels than a fixed
 * enum can capture, so this is a plain string; KNOWN_DOSAGE_FORMS lists the
 * most common values for documentation only.
 */
export type DosageForm = string;

/** Most common MedEx dosage-form labels (documentation aid, not enforced). */
export const KNOWN_DOSAGE_FORMS = [
  "Tablet",
  "Capsule",
  "Syrup",
  "Suspension",
  "Oral Suspension",
  "Injection",
  "IV Infusion",
  "Cream",
  "Ointment",
  "Drops",
  "Pediatric Drop",
  "Suppository",
  "Powder for Suspension",
  "Effervescent Powder",
  "Sachet",
  "Inhaler",
  "Nasal Spray",
] as const;

/** A single sellable product unit: one brand at one strength in one form. */
export interface Medicine extends BaseRecord {
  /** Generic (INN) name of the active ingredient(s), verbatim. */
  generic: string;
  /** Active ingredient(s), derived by splitting `generic` on "+". */
  activeIngredients: string[];
  /** Strength value as written at the source (e.g. "500 mg"); null when the page does not show it. */
  strength: string | null;
  /** Dosage form, verbatim from the source icon/label; "Other" when unrecognised. */
  dosageForm: DosageForm;
  /**
   * Manufacturer / company id, resolvable via the manufacturers endpoint.
   * Null when the page shows only the company name without a link.
   */
  manufacturerId: string | null;
  /** Manufacturer display name, verbatim; null when absent. */
  manufacturerName: string | null;
  /** Package description as written at the source (e.g. "Strip of 10 tablets"); null when absent. */
  package: string | null;
  /** Unit price in BDT when published; null when the source omits it. */
  priceBdt: number | null;
  /** Therapeutic class labels, verbatim when present. */
  categories: string[];
}

/** An active ingredient / generic entity that groups many brands. */
export interface Generic extends BaseRecord {
  /** Active ingredient(s) that define this generic, verbatim. */
  activeIngredients: string[];
  /** Short description, verbatim when present; else null. */
  description: string | null;
  /** Number of brand products listed for this generic; null when unknown. */
  brandCount: number | null;
}

/** A pharmaceutical manufacturer / company. */
export interface Manufacturer extends BaseRecord {
  /** Short description, verbatim when present; else null. */
  description: string | null;
  /** Website URL when the source publishes one; else null. */
  website: string | null;
  /** Number of brand products known to the source for this manufacturer; null when unknown. */
  productCount: number | null;
}

/** A therapeutic / classification category grouping medicines. */
export interface Category extends BaseRecord {
  /** Number of medicines in this category; null when the source page does not publish it. */
  medicineCount: number | null;
  /** Longer description, verbatim when present; else null. */
  description: string | null;
}

/** Standard pagination metadata attached to list responses. */
export interface PageMeta {
  page: number;
  limit: number;
  /**
   * Total matching items. For the live provider many MedEx list pages do not
   * publish a total count; in that case `total` is -1, `totalExact` is false,
   * and `note` explains the situation.
   */
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
  /** False when `total` / `totalPages` are estimates or unknown (-1). */
  totalExact?: boolean;
  /** Optional human-readable caveat about this page of results. */
  note?: string;
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
