import { expect, test } from '@playwright/test';
import { publicGet } from '../../src/clients/rest.js';
import { KrakenWs } from '../../src/clients/ws.js';
import { PAIRS } from '../../src/fixtures/pairs.js';
import { parseOrFail } from '../../src/schemas/common.js';
import { DepthEnvelope } from '../../src/schemas/depth.js';
import { WsBookMessage } from '../../src/schemas/ws.js';

// Same tolerance rationale as ticker cross-check (TEST_PLAN.md §8); a snapshot
// pair taken ~1-2s apart may legitimately move a tick, never half a percent.
const TOLERANCE_PCT = 0.5;

function pctDiff(a: number, b: number): number {
  return (Math.abs(a - b) / ((a + b) / 2)) * 100;
}

test.describe('REST Depth vs WS book snapshot', () => {
  for (const pair of PAIRS) {
    test(`${pair.label}: top of book agrees across transports`, async ({ request }) => {
      const ws = await KrakenWs.connect();
      try {
        await ws.subscribe({ channel: 'book', symbol: [pair.wsSymbol], depth: 10 });
        const wsBook = parseOrFail(
          WsBookMessage,
          await ws.next((m) => m['channel'] === 'book' && m['type'] === 'snapshot', {
            description: 'book snapshot',
          }),
          'WS book snapshot',
        ).data[0];
        if (!wsBook) throw new Error('WS book snapshot carried no data');

        const restBook = parseOrFail(
          DepthEnvelope,
          await publicGet(request, 'Depth', { pair: pair.restQuery, count: 10 }),
          `Depth(${pair.label})`,
        ).result[pair.restKey];
        expect(restBook, `REST result should be keyed ${pair.restKey}`).toBeDefined();
        if (!restBook) return;

        const comparisons: [string, number, number][] = [
          ['best bid', Number(restBook.bids[0]?.[0]), wsBook.bids[0]?.price ?? NaN],
          ['best ask', Number(restBook.asks[0]?.[0]), wsBook.asks[0]?.price ?? NaN],
        ];
        // Both transports must describe one order book — divergence here means
        // a trader's chart and their execution venue disagree (risk 7).
        for (const [what, restValue, wsValue] of comparisons) {
          expect(
            pctDiff(restValue, wsValue),
            `${what} diverged beyond ${TOLERANCE_PCT}%: REST=${restValue} WS=${wsValue}`,
          ).toBeLessThanOrEqual(TOLERANCE_PCT);
        }
        // And each snapshot must be internally uncrossed against the other's mid:
        // REST best bid must not exceed WS best ask beyond tolerance drift.
        expect(
          Number(restBook.bids[0]?.[0]),
          'REST best bid should not cross WS best ask',
        ).toBeLessThanOrEqual((wsBook.asks[0]?.price ?? NaN) * (1 + TOLERANCE_PCT / 100));
      } finally {
        await ws.close();
      }
    });
  }
});
