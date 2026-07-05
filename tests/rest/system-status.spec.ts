import { expect, test } from '@playwright/test';
import { publicGet } from '../../src/clients/rest.js';
import { parseOrFail } from '../../src/schemas/common.js';
import { SystemStatusEnvelope } from '../../src/schemas/system-status.js';

test.describe('SystemStatus', () => {
  test('system is online (skips, not fails, during degraded operation)', async ({ request }) => {
    const body = parseOrFail(
      SystemStatusEnvelope,
      await publicGet(request, 'SystemStatus'),
      'SystemStatus',
    );
    // Maintenance/cancel_only is Kraken's planned state, not our defect: a red suite
    // would train people to ignore red. Skip with the reason on record instead.
    test.skip(
      body.result.status !== 'online',
      `Kraken reports status '${body.result.status}' — market-data invariants are not meaningful in this mode`,
    );
    expect(body.result.status).toBe('online');
    // Status timestamp must be recent — a stale status page is itself a defect.
    const ageMs = Date.now() - new Date(body.result.timestamp).getTime();
    expect(
      Math.abs(ageMs),
      'SystemStatus timestamp should be within 5 minutes of now',
    ).toBeLessThan(5 * 60_000);
  });
});
