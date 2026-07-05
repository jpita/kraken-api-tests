import { z } from 'zod';
import { krakenEnvelope, NumericString } from './common.js';

/** One book level: [price, volume, timestamp]. */
export const DepthLevel = z.tuple([NumericString, NumericString, z.number()]);

export const DepthBook = z.object({
  asks: z.array(DepthLevel),
  bids: z.array(DepthLevel),
});

export const DepthEnvelope = krakenEnvelope(z.record(DepthBook));
export type DepthBookT = z.infer<typeof DepthBook>;
