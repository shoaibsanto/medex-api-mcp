import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";

/**
 * BrowserSession owns a single headless Chromium instance (launched lazily on
 * first use) and serializes every navigation through a polite queue.
 *
 * Design goals:
 *  - Reuse one browser + context across requests within the MCP process.
 *  - Perform a FRESH page navigation for each request (no page reuse, so one
 *    request can never observe another request's DOM).
 *  - Never persist extracted data; only the browser process itself is reused.
 *  - Enforce a minimum delay between navigations (rate limiting) and a hard
 *    per-navigation timeout, so a slow or blocked site cannot hang callers.
 *  - Surface navigation failures as typed errors; never fall back to canned
 *    data.
 */

/** Thrown when navigation fails, times out, or the site refuses the request. */
export class NavigationError extends Error {
  readonly url: string;
  readonly kind: "timeout" | "network" | "http" | "blocked" | "unknown";
  readonly statusCode?: number;

  constructor(message: string, url: string, kind: NavigationError["kind"], statusCode?: number) {
    super(message);
    this.name = "NavigationError";
    this.url = url;
    this.kind = kind;
    this.statusCode = statusCode;
  }
}

/** Result of a successful navigation. */
export interface NavigationResult {
  /** Final URL after redirects. */
  url: string;
  /** HTTP status of the main response. */
  status: number;
  /** Full rendered HTML of the page. */
  html: string;
  /** When the page finished loading (ISO-8601). */
  retrievedAt: string;
}

export interface BrowserSessionOptions {
  /** Minimum milliseconds between two navigations. Default 1200. */
  minDelayMs?: number;
  /** Per-navigation timeout in milliseconds. Default 30000. */
  navigationTimeoutMs?: number;
  /**
   * Executable path override. When unset, tries the channels below in order:
   * "chrome", "msedge", then the playwright bundled chromium if installed.
   */
  executablePath?: string;
}

const DEFAULT_MIN_DELAY_MS = 1200;
const DEFAULT_NAV_TIMEOUT_MS = 30_000;

export class BrowserSession {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private launching: Promise<void> | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private lastNavAt = 0;
  private readonly minDelayMs: number;
  private readonly navigationTimeoutMs: number;
  private readonly executablePath?: string;
  private closed = false;

  constructor(opts: BrowserSessionOptions = {}) {
    this.minDelayMs = opts.minDelayMs ?? DEFAULT_MIN_DELAY_MS;
    this.navigationTimeoutMs = opts.navigationTimeoutMs ?? DEFAULT_NAV_TIMEOUT_MS;
    this.executablePath = opts.executablePath;
  }

  /** Launch the browser on first use; concurrent callers share one launch. */
  private async ensureBrowser(): Promise<BrowserContext> {
    if (this.closed) throw new NavigationError("BrowserSession is closed", "about:blank", "unknown");
    if (this.context) return this.context;
    if (!this.launching) {
      this.launching = (async () => {
        const launchOpts: Parameters<typeof chromium.launch>[0] = {
          headless: true,
          // Keep memory bounded; these pages are small.
          args: ["--disable-dev-shm-usage", "--no-sandbox"],
        };
        if (this.executablePath) {
          launchOpts.executablePath = this.executablePath;
        } else {
          // Prefer an already-installed system browser so no browser download
          // is required. Fall back through common channels.
          launchOpts.channel = "chrome";
        }
        try {
          this.browser = await chromium.launch(launchOpts);
        } catch (err) {
          if (!this.executablePath) {
            // Retry with Edge, then with no channel (bundled chromium).
            try {
              this.browser = await chromium.launch({ ...launchOpts, channel: "msedge" });
            } catch {
              try {
                this.browser = await chromium.launch({ ...launchOpts, channel: undefined });
              } catch (err3) {
                this.launching = null;
                throw new Error(
                  `Could not launch a Chromium browser. Install Google Chrome, Microsoft Edge, ` +
                    `or a Playwright chromium, or set MEDEX_BROWSER_EXECUTABLE. ` +
                    `Last error: ${(err3 as Error).message}`,
                );
              }
            }
          } else {
            this.launching = null;
            throw err;
          }
        }
        this.context = await this.browser.newContext({
          // Behave like a normal desktop visitor; no stealth tricks.
          viewport: { width: 1366, height: 900 },
          locale: "en-US",
          timezoneId: "Asia/Dhaka",
        });
      })();
    }
    await this.launching;
    if (!this.context) throw new Error("browser context failed to initialize");
    return this.context;
  }

  /** Serialize navigations with a polite delay between them. */
  private schedule<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(async () => {
      const wait = this.lastNavAt + this.minDelayMs - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      this.lastNavAt = Date.now();
      return fn();
    });
    // Keep the chain alive even after a failure.
    this.queue = run.catch(() => undefined);
    return run;
  }

  /**
   * Navigate to `url` with a fresh page, wait for the network to settle, and
   * return the rendered HTML. Throws NavigationError on failure — callers must
   * propagate, never substitute data.
   */
  navigate(url: string): Promise<NavigationResult> {
    return this.schedule(() => this.navigateNow(url));
  }

  private async navigateNow(url: string): Promise<NavigationResult> {
    const context = await this.ensureBrowser();
    const page: Page = await context.newPage();
    try {
      const response = await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: this.navigationTimeoutMs,
      });
      // Give any lazy content a brief moment, but do not wait on third-party
      // analytics. "load" with a bounded timeout is a good middle ground.
      await page.waitForLoadState("load", { timeout: 5000 }).catch(() => undefined);
      const status = response?.status() ?? 0;
      if (status >= 400) {
        throw new NavigationError(
          `MedEx responded with HTTP ${status} for ${url}`,
          url,
          status === 403 || status === 429 ? "blocked" : "http",
          status,
        );
      }
      const html = await page.content();
      return { url: page.url(), status, html, retrievedAt: new Date().toISOString() };
    } catch (err) {
      if (err instanceof NavigationError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      let kind: NavigationError["kind"] = "unknown";
      if (/timeout/i.test(msg)) kind = "timeout";
      else if (/net::|ECONN|ENOTFOUND|EAI_AGAIN|refused/i.test(msg)) kind = "network";
      throw new NavigationError(`Navigation to ${url} failed: ${msg}`, url, kind);
    } finally {
      // Never reuse a page across requests.
      await page.close().catch(() => undefined);
    }
  }

  /** Close the browser and reject any further navigation. */
  async close(): Promise<void> {
    this.closed = true;
    try {
      await this.queue;
    } catch {
      /* ignore queued failures */
    }
    if (this.context) await this.context.close().catch(() => undefined);
    if (this.browser) await this.browser.close().catch(() => undefined);
    this.context = null;
    this.browser = null;
  }
}
