import type { APIRequestContext } from '@playwright/test';

const BASE_URL = 'https://api.kraken.com/0/public';

// Kraken public REST allows ~1 req/s per IP; 1100ms spacing keeps a 10% safety
// margin so CI never trips 429 (TEST_PLAN.md §5).
const MIN_SPACING_MS = 1100;

/** Kraken returned HTTP 200 but a business-level error in the envelope. */
export class KrakenApiError extends Error {
  constructor(
    public readonly endpoint: string,
    public readonly errors: string[],
  ) {
    super(`Kraken /${endpoint} returned API error(s): ${errors.join(', ')}`);
    this.name = 'KrakenApiError';
  }
}

/** Transport-level failure (non-2xx status). A 429 here means the rate guard regressed. */
export class KrakenHttpError extends Error {
  constructor(
    public readonly endpoint: string,
    public readonly status: number,
  ) {
    super(`Kraken /${endpoint} returned HTTP ${status}`);
    this.name = 'KrakenHttpError';
  }
}

// Module-level queue: with workers=1 every test in the process funnels through
// this, so total request rate stays below Kraken's public limit.
let lastRequestAt = 0;
let queueTail: Promise<void> = Promise.resolve();

async function throttled<T>(task: () => Promise<T>): Promise<T> {
  const run = queueTail.then(async () => {
    // Deliberate pacing delay, not a synchronization sleep: this is the
    // client-side rate-limit guard from TEST_PLAN.md §5.
    const waitMs = lastRequestAt + MIN_SPACING_MS - Date.now();
    if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
    lastRequestAt = Date.now();
    return task();
  });
  queueTail = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/**
 * GET a Kraken public endpoint and return the full envelope (`{error, result}`)
 * as `unknown` — narrowing is the job of the zod schemas, not this client.
 * Throws typed errors on HTTP failure or a non-empty `error` array.
 */
export async function publicGet(
  request: APIRequestContext,
  endpoint: string,
  params?: Record<string, string | number>,
): Promise<unknown> {
  return throttled(async () => {
    const response = await request.get(`${BASE_URL}/${endpoint}`, { params });
    if (!response.ok()) throw new KrakenHttpError(endpoint, response.status());
    const body: unknown = await response.json();
    const errors = (body as { error?: unknown }).error;
    if (Array.isArray(errors) && errors.length > 0) {
      throw new KrakenApiError(endpoint, errors.map(String));
    }
    return body;
  });
}
