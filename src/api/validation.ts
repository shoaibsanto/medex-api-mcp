import { z } from "zod";

/**
 * Shared validation schemas for query parameters.
 *
 * Every list/search route parses its query through one of these. Parsing
 * failure produces a consistent 400 with per-field details (see the validate
 * middleware), never a stack trace.
 */

/** Pagination inputs, coerced from strings and clamped to sane bounds. */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/** Search = pagination plus a required, non-empty query string. */
export const searchSchema = paginationSchema.extend({
  q: z
    .string()
    .trim()
    .min(1, "query parameter 'q' must not be empty")
    .max(200, "query parameter 'q' must be at most 200 characters"),
});

/** List = pagination plus an optional name filter. */
export const listSchema = paginationSchema.extend({
  q: z.string().trim().max(200).optional(),
});

/** Path param for :id, constrained to the fixture id shape. */
export const idSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, "id may only contain letters, digits, '-' and '_'");

export type Pagination = z.infer<typeof paginationSchema>;
export type Search = z.infer<typeof searchSchema>;
export type List = z.infer<typeof listSchema>;
