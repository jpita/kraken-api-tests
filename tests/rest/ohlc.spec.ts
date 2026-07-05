import { expect, test } from '@playwright/test';
import { publicGet } from '../../src/clients/rest.js';
import { PAIRS } from '../../src/fixtures/pairs.js';
import { parseOrFail } from '../../src/schemas/common.js';
import { OhlcEnvelope } from '../../src/schemas/ohlc.js';

test.describe('OHLC', () => {
  for (const pair of PAIRS) {
    test(`${pair.label}: every candle internally consistent, timestamps monotonic`, async ({
      request,
    }) => {
      const body = parseOrFail(
        OhlcEnvelope,
        await publicGet(request, 'OHLC', { pair: pair.restQuery, interval: 1 }),
        `OHLC(${pair.label})`,
      );
      const candles = body.result[pair.restKey];
      expect(Array.isArray(candles), `result should be keyed ${pair.restKey}`).toBe(true);
      if (!Array.isArray(candles)) return;
      expect(candles.length, 'expected a non-trivial candle history').toBeGreaterThan(10);

      let prevTime = 0;
      for (const [time, open, high, low, close] of candles) {
        const [o, h, l, c] = [Number(open), Number(high), Number(low), Number(close)];
        const at = `candle @${time}`;
        // low <= open/close <= high: any violation means the candle lies about
        // the range it traded — backtests built on it silently corrupt.
        expect(l, `${at}: low must not exceed open`).toBeLessThanOrEqual(o);
        expect(o, `${at}: open must not exceed high`).toBeLessThanOrEqual(h);
        expect(l, `${at}: low must not exceed close`).toBeLessThanOrEqual(c);
        expect(c, `${at}: close must not exceed high`).toBeLessThanOrEqual(h);
        // Strictly increasing bucket times: duplicates or reordering break every charting lib.
        expect(time, `${at}: timestamps must be strictly increasing`).toBeGreaterThan(prevTime);
        prevTime = time;
      }
    });
  }
});
