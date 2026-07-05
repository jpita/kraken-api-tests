import { expect, test } from '@playwright/test';
import { publicGet } from '../../src/clients/rest.js';
import { parseOrFail } from '../../src/schemas/common.js';
import { TickerEnvelope } from '../../src/schemas/ticker.js';
import { PAIRS } from '../../src/fixtures/pairs.js';

test.describe('Ticker', () => {
  for (const pair of PAIRS) {
    test(`${pair.label}: last trade inside today's range, book not crossed`, async ({
      request,
    }) => {
      const body = parseOrFail(
        TickerEnvelope,
        await publicGet(request, 'Ticker', { pair: pair.restQuery }),
        `Ticker(${pair.label})`,
      );
      const ticker = body.result[pair.restKey];
      expect(ticker, `result should be keyed ${pair.restKey}`).toBeDefined();
      if (!ticker) return;

      const last = Number(ticker.c[0]);
      const [todayLow] = ticker.l;
      const [todayHigh] = ticker.h;
      // The last print is part of today's session, so it must sit inside today's
      // [low, high] — a print outside the day's own range is a corrupt tape.
      expect(last).toBeGreaterThanOrEqual(Number(todayLow));
      expect(last).toBeLessThanOrEqual(Number(todayHigh));

      // bid > ask is a crossed market — phantom arbitrage that fills at worse prices.
      expect(Number(ticker.b[0])).toBeLessThanOrEqual(Number(ticker.a[0]));

      // A day whose low exceeds its high is internally inconsistent regardless of last.
      expect(Number(todayLow)).toBeLessThanOrEqual(Number(todayHigh));
    });
  }
});
