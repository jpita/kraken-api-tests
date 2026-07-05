import { expect, test } from '@playwright/test';
import { metadataFor } from '../../src/fixtures/pair-metadata.js';
import { PAIRS } from '../../src/fixtures/pairs.js';

test.describe('AssetPairs', () => {
  for (const pair of PAIRS) {
    test(`${pair.label}: trading metadata present and sane`, async ({ request }) => {
      const info = await metadataFor(request, pair);

      // ordermin is the minimum order size — zero/negative would make every order valid or none.
      expect(Number(info.ordermin), 'ordermin must be a positive quantity').toBeGreaterThan(0);
      // tick_size must agree with pair_decimals: the smallest price step is 10^-pair_decimals.
      expect(Number(info.tick_size)).toBeCloseTo(10 ** -info.pair_decimals, 10);
      // Lot precision finer than 8 decimals would break every downstream qty formatter.
      expect(info.lot_decimals).toBeLessThanOrEqual(8);
      // A pair the suite trades assertions on should itself be tradeable.
      expect(info.status, `${pair.label} expected online`).toBe('online');
    });
  }
});
