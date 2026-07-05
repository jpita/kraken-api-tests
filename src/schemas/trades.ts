import { z } from 'zod';
import { krakenEnvelope, NumericString } from './common.js';

/**
 * One trade: [price, volume, time, side, order type, misc, trade_id].
 * side/type are closed enums — a new value means Kraken changed trade
 * semantics and every downstream consumer needs to know.
 */
export const Trade = z.tuple([
  NumericString,
  NumericString,
  z.number(),
  z.enum(['b', 's']),
  z.enum(['m', 'l']),
  z.string(),
  z.number().int(),
]);

// `last` here is a nanosecond cursor serialised as string (unlike OHLC's numeric
// `last`) — pinned faithfully, see TEST_PLAN.md §7.
export const TradesResult = z.object({ last: z.string().regex(/^\d+$/) }).catchall(z.array(Trade));
export const TradesEnvelope = krakenEnvelope(TradesResult);
export type TradeT = z.infer<typeof Trade>;
