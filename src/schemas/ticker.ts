import { z } from 'zod';
import { krakenEnvelope, NumericString } from './common.js';

/** REST Ticker uses Kraken's legacy one-letter field scheme; pinned as-is. */
export const TickerInfo = z.object({
  /** ask: [price, whole lot volume, lot volume] */
  a: z.tuple([NumericString, NumericString, NumericString]),
  /** bid: [price, whole lot volume, lot volume] */
  b: z.tuple([NumericString, NumericString, NumericString]),
  /** last trade closed: [price, lot volume] */
  c: z.tuple([NumericString, NumericString]),
  /** volume: [today, last 24h] */
  v: z.tuple([NumericString, NumericString]),
  /** VWAP: [today, last 24h] */
  p: z.tuple([NumericString, NumericString]),
  /** number of trades: [today, last 24h] */
  t: z.tuple([z.number().int(), z.number().int()]),
  /** low: [today, last 24h] */
  l: z.tuple([NumericString, NumericString]),
  /** high: [today, last 24h] */
  h: z.tuple([NumericString, NumericString]),
  /** today's opening price */
  o: NumericString,
});

export const TickerEnvelope = krakenEnvelope(z.record(TickerInfo));
export type TickerInfoT = z.infer<typeof TickerInfo>;
