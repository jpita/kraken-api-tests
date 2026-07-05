import { z } from 'zod';
import { krakenEnvelope, NumericString } from './common.js';

/** One candle: [time, open, high, low, close, vwap, volume, count]. */
export const Candle = z.tuple([
  z.number().int(),
  NumericString,
  NumericString,
  NumericString,
  NumericString,
  NumericString,
  NumericString,
  z.number().int(),
]);

// `last` (id for incremental fetches) sits alongside the pair keys in the same
// object — modelled with catchall so pair keys stay open but candles stay pinned.
export const OhlcResult = z.object({ last: z.number() }).catchall(z.array(Candle));
export const OhlcEnvelope = krakenEnvelope(OhlcResult);
export type CandleT = z.infer<typeof Candle>;
