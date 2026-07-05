import { expect, test } from '@playwright/test';
import { publicGet } from '../../src/clients/rest.js';
import { significantDecimals } from '../../src/domain/decimals.js';
import { metadataFor } from '../../src/fixtures/pair-metadata.js';
import { PAIRS } from '../../src/fixtures/pairs.js';
import { parseOrFail } from '../../src/schemas/common.js';
import { DepthEnvelope } from '../../src/schemas/depth.js';

const DEPTH = 25;

test.describe('Depth', () => {
  for (const pair of PAIRS) {
    test(`${pair.label}: book ordered, uncrossed, precision conforms to metadata`, async ({
      request,
    }) => {
      const meta = await metadataFor(request, pair);
      const body = parseOrFail(
        DepthEnvelope,
        await publicGet(request, 'Depth', { pair: pair.restQuery, count: DEPTH }),
        `Depth(${pair.label})`,
      );
      const book = body.result[pair.restKey];
      expect(book, `result should be keyed ${pair.restKey}`).toBeDefined();
      if (!book) return;

      expect(book.bids.length, 'bid side should not be empty').toBeGreaterThan(0);
      expect(book.asks.length, 'ask side should not be empty').toBeGreaterThan(0);

      // Bids must strictly descend: equal prices = duplicate level, ascending = corrupt sort.
      for (let i = 1; i < book.bids.length; i++) {
        const [prev, curr] = [Number(book.bids[i - 1]?.[0]), Number(book.bids[i]?.[0])];
        expect(curr, `bids[${i}] must be strictly below bids[${i - 1}]`).toBeLessThan(prev);
      }
      // Asks must strictly ascend, mirror reasoning.
      for (let i = 1; i < book.asks.length; i++) {
        const [prev, curr] = [Number(book.asks[i - 1]?.[0]), Number(book.asks[i]?.[0])];
        expect(curr, `asks[${i}] must be strictly above asks[${i - 1}]`).toBeGreaterThan(prev);
      }

      // Crossed book (best bid >= best ask) means feed corruption — risk #1 in TEST_PLAN.md.
      expect(Number(book.bids[0]?.[0])).toBeLessThan(Number(book.asks[0]?.[0]));

      // Every price/volume must respect the pair's declared precision: extra significant
      // decimals mean either wrong metadata or wrong prices — both round to wrong orders.
      for (const [side, levels] of [
        ['bids', book.bids],
        ['asks', book.asks],
      ] as const) {
        for (const [price, volume] of levels) {
          expect(
            significantDecimals(price),
            `${side} price ${price} exceeds pair_decimals=${meta.pair_decimals}`,
          ).toBeLessThanOrEqual(meta.pair_decimals);
          expect(
            significantDecimals(volume),
            `${side} volume ${volume} exceeds lot_decimals=${meta.lot_decimals}`,
          ).toBeLessThanOrEqual(meta.lot_decimals);
        }
      }
    });
  }
});
