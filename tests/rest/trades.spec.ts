import { expect, test } from '@playwright/test';
import { publicGet } from '../../src/clients/rest.js';
import { PAIRS } from '../../src/fixtures/pairs.js';
import { parseOrFail } from '../../src/schemas/common.js';
import { TradesEnvelope } from '../../src/schemas/trades.js';

test.describe('Trades', () => {
  for (const pair of PAIRS) {
    test(`${pair.label}: tape ordered in time, sides and order types closed sets`, async ({
      request,
    }) => {
      const body = parseOrFail(
        TradesEnvelope,
        await publicGet(request, 'Trades', { pair: pair.restQuery }),
        `Trades(${pair.label})`,
      );
      const trades = body.result[pair.restKey];
      expect(Array.isArray(trades), `result should be keyed ${pair.restKey}`).toBe(true);
      if (!Array.isArray(trades)) return;
      expect(trades.length, 'expected recent trades on a major pair').toBeGreaterThan(0);

      let prevTime = 0;
      for (const [price, volume, time, side, orderType, , tradeId] of trades) {
        const at = `trade #${tradeId}`;
        // The public tape must be time-ordered; equal timestamps are legal
        // (multiple fills of one crossing order), going backwards is not.
        expect(time, `${at}: tape must be non-decreasing in time`).toBeGreaterThanOrEqual(prevTime);
        prevTime = time;
        // Executed trades always have positive price and size — zero either way is a phantom print.
        expect(Number(price), `${at}: price must be positive`).toBeGreaterThan(0);
        expect(Number(volume), `${at}: volume must be positive`).toBeGreaterThan(0);
        // Redundant with the schema enum, kept explicit: side/type outside {b,s}/{m,l}
        // changes taker-flow analytics semantics.
        expect(['b', 's']).toContain(side);
        expect(['m', 'l']).toContain(orderType);
      }
    });
  }
});
