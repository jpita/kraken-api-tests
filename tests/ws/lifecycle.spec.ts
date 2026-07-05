import { expect, test } from '@playwright/test';
import { KrakenWs } from '../../src/clients/ws.js';
import { parseOrFail } from '../../src/schemas/common.js';
import { WsSubscribeAck } from '../../src/schemas/ws.js';

test.describe('WS subscription lifecycle', () => {
  test('unsubscribe is acked and actually stops the stream', async () => {
    const ws = await KrakenWs.connect();
    try {
      const isTicker = (m: Record<string, unknown>) => m['channel'] === 'ticker';
      await ws.subscribe({ channel: 'ticker', symbol: ['BTC/USD'], event_trigger: 'bbo' });
      await ws.next(isTicker, { description: 'ticker message while subscribed' });

      // event_trigger must be repeated: it is part of the subscription identity,
      // and omitting it gets "Subscription Not Found" (TEST_PLAN.md §7).
      const ack = parseOrFail(
        WsSubscribeAck,
        await ws.unsubscribe({ channel: 'ticker', symbol: ['BTC/USD'], event_trigger: 'bbo' }),
        'unsubscribe ack',
      );
      expect(ack.method).toBe('unsubscribe');

      // One in-flight update may legitimately cross the ack; let one heartbeat
      // pass as a drain window, then watch a further 3 heartbeats (~3s of live
      // connection) — heartbeats double as an event-driven clock, no sleeps.
      await ws.next((m) => m['channel'] === 'heartbeat', { since: ws.mark() });
      const silentFrom = ws.mark();
      await ws.collect((m) => m['channel'] === 'heartbeat', {
        count: 3,
        timeoutMs: 10_000,
        since: silentFrom,
        description: 'post-unsubscribe heartbeat',
      });

      const leaked = ws.received.slice(silentFrom).filter(isTicker);
      // Data after an acked unsubscribe means subscription state is broken server-side.
      expect(leaked, 'no ticker messages may arrive after unsubscribe ack').toHaveLength(0);
    } finally {
      await ws.close();
    }
  });
});
