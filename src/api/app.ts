import express, { type Express, type NextFunction, type Request, type Response } from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import type { Provider } from "../provider/provider.js";
import { errorHandler, notFoundHandler, HttpError } from "./errors.js";
import { searchSchema, listSchema, idSchema } from "./validation.js";
import { VERSION } from "../config.js";

/** Options accepted by createApp. */
export interface AppOptions {
  provider: Provider;
  /** CORS origin(s). Defaults to permissive "*" for local development. */
  corsOrigin?: string | string[];
  /** Requests allowed per windowMs per IP. Defaults to 100/15min. */
  rateLimitMax?: number;
  /** Rate-limit window in ms. Defaults to 15 minutes. */
  rateLimitWindowMs?: number;
  /** Set false to disable the rate limiter (used in unit tests). */
  enableRateLimit?: boolean;
}

/** Minimal CORS handler (avoids an extra dependency). */
function cors(origin: string | string[]) {
  const allowed = Array.isArray(origin) ? origin : [origin];
  return (req: Request, res: Response, next: NextFunction): void => {
    const reqOrigin = req.headers.origin;
    if (reqOrigin && (allowed.includes("*") || allowed.includes(reqOrigin))) {
      res.setHeader("Access-Control-Allow-Origin", allowed.includes("*") ? "*" : reqOrigin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type,Accept");
    }
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  };
}

/** Async route handler wrapper so rejections reach the error handler. */
function h(fn: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res).catch(next);
  };
}

/** Parse and validate a request body/query against a Zod schema. */
function parse<T>(schema: { parse: (v: unknown) => T }, value: unknown): T {
  return schema.parse(value);
}

export function createApp(opts: AppOptions): Express {
  const { provider } = opts;
  const app = express();

  app.disable("x-powered-by");
  app.use(helmet());
  app.use(cors(opts.corsOrigin ?? "*"));
  app.use(express.json({ limit: "100kb" }));

  if (opts.enableRateLimit !== false) {
    app.use(
      rateLimit({
        windowMs: opts.rateLimitWindowMs ?? 15 * 60 * 1000,
        max: opts.rateLimitMax ?? 100,
        standardHeaders: true,
        legacyHeaders: false,
        message: {
          error: { code: "rate_limited", message: "Too many requests. Please retry later." },
        },
      }),
    );
  }

  // ---- Health / readiness -------------------------------------------------
  app.get("/api/v1/health", (_req, res) => {
    res.json({
      status: "ok",
      version: VERSION,
      provider: {
        name: provider.name,
        kind: provider.isLive ? "live" : "fixture",
        live: provider.isLive,
      },
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  });

  app.get("/api/v1/ready", (_req, res) => {
    // Ready as long as the provider is constructed (fixture always is).
    res.json({ ready: true, provider: provider.name });
  });

  // ---- Medicines ----------------------------------------------------------
  app.get(
    "/api/v1/medicines/search",
    h(async (req, res) => {
      const q = parse(searchSchema, req.query);
      res.json(await provider.searchMedicines({ q: q.q, page: q.page, limit: q.limit }));
    }),
  );

  app.get(
    "/api/v1/medicines/:id",
    h(async (req, res) => {
      const id = parse(idSchema, req.params.id);
      const result = await provider.getMedicine(id);
      if (!result) throw new HttpError(404, "not_found", `Medicine '${id}' not found.`);
      res.json(result);
    }),
  );

  // ---- Generics -----------------------------------------------------------
  app.get(
    "/api/v1/generics/search",
    h(async (req, res) => {
      const q = parse(searchSchema, req.query);
      res.json(await provider.searchGenerics({ q: q.q, page: q.page, limit: q.limit }));
    }),
  );

  app.get(
    "/api/v1/generics/:id",
    h(async (req, res) => {
      const id = parse(idSchema, req.params.id);
      const result = await provider.getGeneric(id);
      if (!result) throw new HttpError(404, "not_found", `Generic '${id}' not found.`);
      res.json(result);
    }),
  );

  app.get(
    "/api/v1/generics/:id/medicines",
    h(async (req, res) => {
      const id = parse(idSchema, req.params.id);
      const q = parse(listSchema, req.query);
      const generic = await provider.getGeneric(id);
      if (!generic) throw new HttpError(404, "not_found", `Generic '${id}' not found.`);
      // Resolve the generic's brands through medicine search by active ingredient.
      const all = await provider.searchMedicines({
        q: generic.data.name,
        page: 1,
        limit: 100,
      });
      res.json({ ...all, meta: { ...all.meta, page: q.page, limit: q.limit, query: generic.data.name } });
    }),
  );

  // ---- Manufacturers ------------------------------------------------------
  app.get(
    "/api/v1/manufacturers",
    h(async (req, res) => {
      const q = parse(listSchema, req.query);
      res.json(await provider.listManufacturers({ page: q.page, limit: q.limit, q: q.q }));
    }),
  );

  app.get(
    "/api/v1/manufacturers/:id",
    h(async (req, res) => {
      const id = parse(idSchema, req.params.id);
      const result = await provider.getManufacturer(id);
      if (!result) throw new HttpError(404, "not_found", `Manufacturer '${id}' not found.`);
      res.json(result);
    }),
  );

  app.get(
    "/api/v1/manufacturers/:id/medicines",
    h(async (req, res) => {
      const id = parse(idSchema, req.params.id);
      const q = parse(listSchema, req.query);
      const mf = await provider.getManufacturer(id);
      if (!mf) throw new HttpError(404, "not_found", `Manufacturer '${id}' not found.`);
      res.json(await provider.listManufacturerMedicines(id, { page: q.page, limit: q.limit, q: q.q }));
    }),
  );

  // ---- Categories ---------------------------------------------------------
  app.get(
    "/api/v1/categories",
    h(async (req, res) => {
      const q = parse(listSchema, req.query);
      res.json(await provider.listCategories({ page: q.page, limit: q.limit, q: q.q }));
    }),
  );

  app.get(
    "/api/v1/categories/:id",
    h(async (req, res) => {
      const id = parse(idSchema, req.params.id);
      const result = await provider.getCategory(id);
      if (!result) throw new HttpError(404, "not_found", `Category '${id}' not found.`);
      res.json(result);
    }),
  );

  app.get(
    "/api/v1/categories/:id/medicines",
    h(async (req, res) => {
      const id = parse(idSchema, req.params.id);
      const q = parse(listSchema, req.query);
      const cat = await provider.getCategory(id);
      if (!cat) throw new HttpError(404, "not_found", `Category '${id}' not found.`);
      res.json(await provider.listCategoryMedicines(id, { page: q.page, limit: q.limit, q: q.q }));
    }),
  );

  app.use("/api", notFoundHandler);
  app.use(errorHandler);
  return app;
}
