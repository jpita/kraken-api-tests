import { z } from 'zod';
import { krakenEnvelope, NumericString } from './common.js';

/**
 * Only the fields downstream tests depend on are pinned; `passthrough` keeps
 * additions from failing the contract (additive change ≠ breaking change),
 * while removals/renames of load-bearing fields still fail loudly.
 */
export const AssetPairInfo = z
  .object({
    altname: z.string(),
    wsname: z.string(),
    base: z.string(),
    quote: z.string(),
    // Price/lot precision drive order rounding — the exact fields a client
    // must respect to avoid mispriced orders (TEST_PLAN.md §2 risk 5).
    pair_decimals: z.number().int().nonnegative(),
    lot_decimals: z.number().int().nonnegative(),
    cost_decimals: z.number().int().nonnegative(),
    ordermin: NumericString,
    tick_size: NumericString,
    status: z.string(),
  })
  .passthrough();

export const AssetPairsResult = z.record(AssetPairInfo);
export const AssetPairsEnvelope = krakenEnvelope(AssetPairsResult);
export type AssetPairInfoT = z.infer<typeof AssetPairInfo>;
