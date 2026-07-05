import { expect, test } from '@playwright/test';
import { KrakenWs } from '../../src/clients/ws.js';
import { PAIRS } from '../../src/fixtures/pairs.js';
import { parseOrFail } from '../../src/schemas/common.js';
import { WsSubscribeAck, WsTickerMessage } from '../../src/schemas/ws.js';

test.describe('WS ticker channel', () => {
  for (const pair of PAIRS) {
    test(`${pair.wsSymbol}: ack, snapshot, then a live stream of valid updates`, async () => {
      const ws = await KrakenWs.connect();
      try {
        // event_trigger=bbo: updates on every top-of-book change, so liveness
        // doesn't depend on trades printing during the window on quieter pairs.
        const ack = parseOrFail(
          WsSubscribeAck,
          await ws.subscribe({
            channel: 'ticker',
            symbol: [pair.wsSymbol],
            event_trigger: 'bbo',
          }),
          `subscribe ack (${pair.wsSymbol})`,
        );
        expect(ack.result?.symbol).toBe(pair.wsSymbol);

        const isTicker = (m: Record<string, unknown>) => m['channel'] === 'ticker';
        const snapshot = parseOrFail(
          WsTickerMessage,
          await ws.next((m) => isTicker(m) && m['type'] === 'snapshot', {
            description: 'ticker snapshot',
          }),
          'ticker snapshot',
        );
        expect(snapshot.data[0]?.symbol).toBe(pair.wsSymbol);

        // A live feed must actually be live: >=3 updates in 30s or traders are
        // pricing off a dead market (TEST_PLAN.md §2 risk 2).
        const updates = await ws.collect((m) => isTicker(m) && m['type'] === 'update', {
          count: 3,
          timeoutMs: 30_000,
          description: `ticker update (${pair.wsSymbol})`,
        });
        for (const raw of updates) {
          const update = parseOrFail(WsTickerMessage, raw, 'ticker update');
          const data = update.data[0];
          expect(data?.symbol).toBe(pair.wsSymbol);
          // Every update must itself describe an uncrossed market.
          expect(data?.bid ?? NaN).toBeLessThanOrEqual(data?.ask ?? NaN);
        }
      } finally {
        await ws.close();
      }
    });
  }
});
