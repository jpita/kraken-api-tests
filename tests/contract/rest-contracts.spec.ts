import { test } from '@playwright/test';
import type { z } from 'zod';
import { publicGet } from '../../src/clients/rest.js';
import { PAIRS } from '../../src/fixtures/pairs.js';
import { parseOrFail } from '../../src/schemas/common.js';
import { SystemStatusEnvelope } from '../../src/schemas/system-status.js';
import { AssetPairsEnvelope } from '../../src/schemas/asset-pairs.js';
import { TickerEnvelope } from '../../src/schemas/ticker.js';
import { DepthEnvelope } from '../../src/schemas/depth.js';
import { OhlcEnvelope } from '../../src/schemas/ohlc.js';
import { TradesEnvelope } from '../../src/schemas/trades.js';
import { SpreadEnvelope } from '../../src/schemas/spread.js';

// The contract layer's only assertion is "the response still has the pinned
// shape" — parseOrFail reports the exact drifted field path on failure.

const ALL_PAIRS = PAIRS.map((p) => p.restQuery).join(',');

const PAIRLESS: { endpoint: string; schema: z.ZodTypeAny; params?: Record<string, string> }[] = [
  { endpoint: 'SystemStatus', schema: SystemStatusEnvelope },
  { endpoint: 'AssetPairs', schema: AssetPairsEnvelope, params: { pair: ALL_PAIRS } },
];

const PER_PAIR: { endpoint: string; schema: z.ZodTypeAny }[] = [
  { endpoint: 'Ticker', schema: TickerEnvelope },
  { endpoint: 'Depth', schema: DepthEnvelope },
  { endpoint: 'OHLC', schema: OhlcEnvelope },
  { endpoint: 'Trades', schema: TradesEnvelope },
  { endpoint: 'Spread', schema: SpreadEnvelope },
];

test.describe('REST contracts', () => {
  for (const { endpoint, schema, params } of PAIRLESS) {
    test(`${endpoint} matches pinned schema`, async ({ request }) => {
      parseOrFail(schema, await publicGet(request, endpoint, params), endpoint);
    });
  }

  for (const { endpoint, schema } of PER_PAIR) {
    for (const pair of PAIRS) {
      test(`${endpoint} ${pair.label} matches pinned schema`, async ({ request }) => {
        parseOrFail(
          schema,
          await publicGet(request, endpoint, { pair: pair.restQuery }),
          `${endpoint}(${pair.label})`,
        );
      });
    }
  }
});
