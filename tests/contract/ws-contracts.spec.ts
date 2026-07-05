import { expect, test } from '@playwright/test';
import { KrakenWs } from '../../src/clients/ws.js';
import { PAIRS } from '../../src/fixtures/pairs.js';
import { parseOrFail } from '../../src/schemas/common.js';
import { schemaForWsMessage } from '../../src/schemas/ws.js';

test.describe('WS v2 contracts', () => {
  test('every message type on a live session matches its pinned schema', async () => {
    const ws = await KrakenWs.connect();
    try {
      const symbols = PAIRS.map((p) => p.wsSymbol);
      for (const symbol of symbols) {
        await ws.subscribe({ channel: 'ticker', symbol: [symbol] });
      }
      await ws.subscribe({ channel: 'book', symbol: symbols, depth: 10 });

      // Gather a representative session: status + acks arrived above; now wait
      // until ticker updates, book updates and heartbeats have all shown up.
      await ws.collect((m) => m['channel'] === 'ticker' && m['type'] === 'update', {
        count: 3,
        timeoutMs: 45_000,
        description: 'ticker update',
      });
      await ws.collect((m) => m['channel'] === 'book' && m['type'] === 'update', {
        count: 3,
        timeoutMs: 45_000,
        description: 'book update',
      });
      await ws.collect((m) => m['channel'] === 'heartbeat', {
        count: 2,
        description: 'heartbeat',
      });

      // Sweep EVERYTHING the session received — not just what we waited for.
      // An unknown channel is drift too: Kraken started sending something new.
      const channelsSeen = new Set<string>();
      ws.received.forEach((msg, i) => {
        const schema = schemaForWsMessage(msg);
        expect(
          schema,
          `message #${i} has unpinned type: ${JSON.stringify(msg).slice(0, 200)}`,
        ).not.toBeNull();
        if (!schema) return;
        parseOrFail(schema, msg, `WS message #${i}`);
        channelsSeen.add(String(msg['channel'] ?? msg['method']));
      });
      // Prove the sweep exercised the full message taxonomy, not a quiet subset.
      for (const required of ['status', 'subscribe', 'ticker', 'book', 'heartbeat']) {
        expect([...channelsSeen], `expected session to include '${required}'`).toContain(required);
      }
    } finally {
      await ws.close();
    }
  });
});
