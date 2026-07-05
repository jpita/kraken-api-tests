import { z } from 'zod';
import { krakenEnvelope } from './common.js';

// A new status value appearing here is drift worth investigating, not widening away:
// trading logic branches on these modes.
export const SystemStatusResult = z.object({
  status: z.enum(['online', 'maintenance', 'cancel_only', 'post_only']),
  timestamp: z.string().datetime(),
});

export const SystemStatusEnvelope = krakenEnvelope(SystemStatusResult);
