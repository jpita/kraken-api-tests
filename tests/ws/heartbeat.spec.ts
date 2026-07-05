import { expect, test } from '@playwright/test';
import { KrakenWs } from '../../src/clients/ws.js';
import { parseOrFail } from '../../src/schemas/common.js';
import { WsHeartbeat } from '../../src/schemas/ws.js';

test.describe('WS heartbeat', () => {
  test('heartbeats arrive at ~1/s while a subscription is active', async () => {
    const ws = await KrakenWs.connect();
    try {
      await ws.subscribe({ channel: 'ticker', symbol: ['BTC/USD'] });
      // Heartbeat cadence is ~1/s; 3 within 10s proves the keepalive channel a
      // client uses for staleness detection is functioning (risk 2).
      const heartbeats = await ws.collect((m) => m['channel'] === 'heartbeat', {
        count: 3,
        timeoutMs: 10_000,
        description: 'heartbeat',
      });
      heartbeats.forEach((hb, i) => parseOrFail(WsHeartbeat, hb, `heartbeat #${i}`));
      expect(heartbeats).toHaveLength(3);
    } finally {
      await ws.close();
    }
  });
});
