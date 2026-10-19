import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import type { ApiError } from "../types.js";

/** An error carrying an HTTP status and a machine-readable code. */
export class HttpError extends Error {
  status: number;
  code: string;
  details?: Array<{ field: string; issue: string }>;
  constructor(
    status: number,
    code: string,
    message: string,
    details?: Array<{ field: string; issue: string }>,
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/** Parse a ZodError into the flat field/issue list used by ApiError. */
function zodDetails(err: ZodError): Array<{ field: string; issue: string }> {
  return err.issues.map((i) => ({
    field: i.path.join(".") || "(root)",
    issue: i.message,
  }));
}

/** 404 handler: any request that fell through routing. */
export function notFoundHandler(_req: Request, res: Response): void {
  const body: ApiError = {
    error: { code: "not_found", message: "The requested resource does not exist." },
  };
  res.status(404).json(body);
}

/** Central error handler: normalizes thrown errors into ApiError. */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  // Zod validation failures (thrown by safeParse callers or route code).
  if (err instanceof ZodError) {
    const body: ApiError = {
      error: {
        code: "validation_error",
        message: "Request validation failed.",
        details: zodDetails(err),
      },
    };
    res.status(400).json(body);
    return;
  }

  if (err instanceof HttpError) {
    const body: ApiError = {
      error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) },
    };
    res.status(err.status).json(body);
    return;
  }

  // Unexpected error: log server-side, return a generic message (no leakage).
  // eslint-disable-next-line no-console
  console.error("[medex-api] unhandled error:", err);
  const body: ApiError = {
    error: { code: "internal_error", message: "An unexpected error occurred." },
  };
  res.status(500).json(body);
}
