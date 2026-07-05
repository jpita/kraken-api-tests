import { expect, test } from '@playwright/test';
import { publicGet } from '../../src/clients/rest.js';
import { PAIRS } from '../../src/fixtures/pairs.js';
import { parseOrFail } from '../../src/schemas/common.js';
import { SpreadEnvelope } from '../../src/schemas/spread.js';

test.describe('Spread', () => {
  for (const pair of PAIRS) {
    test(`${pair.label}: bid <= ask in every historical entry`, async ({ request }) => {
      const body = parseOrFail(
        SpreadEnvelope,
        await publicGet(request, 'Spread', { pair: pair.restQuery }),
        `Spread(${pair.label})`,
      );
      const entries = body.result[pair.restKey];
      expect(Array.isArray(entries), `result should be keyed ${pair.restKey}`).toBe(true);
      if (!Array.isArray(entries)) return;
      expect(entries.length, 'expected recent spread history on a major pair').toBeGreaterThan(0);

      let prevTime = 0;
      for (const [time, bid, ask] of entries) {
        // A historical crossed spread means the feed recorded a corrupt market state.
        expect(Number(bid), `entry @${time}: bid must not exceed ask`).toBeLessThanOrEqual(
          Number(ask),
        );
        // Multiple book changes can share a second; time running backwards cannot.
        expect(
          time,
          `entry @${time}: history must be non-decreasing in time`,
        ).toBeGreaterThanOrEqual(prevTime);
        prevTime = time;
      }
    });
  }
});
