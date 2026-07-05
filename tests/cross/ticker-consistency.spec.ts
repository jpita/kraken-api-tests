import { expect, test } from '@playwright/test';
import { publicGet } from '../../src/clients/rest.js';
import { KrakenWs } from '../../src/clients/ws.js';
import { PAIRS } from '../../src/fixtures/pairs.js';
import { parseOrFail } from '../../src/schemas/common.js';
import { TickerEnvelope } from '../../src/schemas/ticker.js';
import { WsTickerMessage } from '../../src/schemas/ws.js';

// 0.5%: far above intra-second drift on majors, far below a wrong-pair or
// wrong-decimal-scale bug — see TEST_PLAN.md §8 for the full reasoning.
const TOLERANCE_PCT = 0.5;

function pctDiff(a: number, b: number): number {
  return (Math.abs(a - b) / ((a + b) / 2)) * 100;
}

test.describe('REST Ticker vs WS ticker', () => {
  for (const pair of PAIRS) {
    test(`${pair.label}: both feeds describe the same market`, async ({ request }) => {
      const ws = await KrakenWs.connect();
      try {
        await ws.subscribe({ channel: 'ticker', symbol: [pair.wsSymbol] });
        const snapshot = parseOrFail(
          WsTickerMessage,
          await ws.next((m) => m['channel'] === 'ticker' && m['type'] === 'snapshot', {
            description: 'ticker snapshot',
          }),
          'WS ticker snapshot',
        ).data[0];
        if (!snapshot) throw new Error('WS ticker snapshot carried no data');

        // Sample REST as close after the WS snapshot as the rate guard allows.
        const rest = parseOrFail(
          TickerEnvelope,
          await publicGet(request, 'Ticker', { pair: pair.restQuery }),
          `Ticker(${pair.label})`,
        ).result[pair.restKey];
        expect(rest, `REST result should be keyed ${pair.restKey}`).toBeDefined();
        if (!rest) return;

        // A trader charting off REST and executing off WS must be seeing one market.
        const comparisons: [string, number, number][] = [
          ['last price', Number(rest.c[0]), snapshot.last],
          ['best bid', Number(rest.b[0]), snapshot.bid],
          ['best ask', Number(rest.a[0]), snapshot.ask],
        ];
        for (const [what, restValue, wsValue] of comparisons) {
          expect(
            pctDiff(restValue, wsValue),
            `${what} diverged beyond ${TOLERANCE_PCT}%: REST=${restValue} WS=${wsValue}`,
          ).toBeLessThanOrEqual(TOLERANCE_PCT);
        }
      } finally {
        await ws.close();
      }
    });
  }
});
