import { z } from 'zod';
import { krakenEnvelope, NumericString } from './common.js';

/** One spread entry: [time, bid, ask]. */
export const SpreadEntry = z.tuple([z.number().int(), NumericString, NumericString]);

export const SpreadResult = z.object({ last: z.number() }).catchall(z.array(SpreadEntry));
export const SpreadEnvelope = krakenEnvelope(SpreadResult);
export type SpreadEntryT = z.infer<typeof SpreadEntry>;
