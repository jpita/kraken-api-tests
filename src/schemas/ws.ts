import { z } from 'zod';

// WS v2 message schemas, pinned against live-captured payloads (2026-07-05).
// Unlike REST, v2 serialises prices/quantities as JSON numbers.

export const WsSubscribeAck = z.object({
  method: z.enum(['subscribe', 'unsubscribe']),
  result: z
    .object({
      channel: z.string(),
      symbol: z.string().optional(),
      snapshot: z.boolean().optional(),
      depth: z.number().int().optional(),
      event_trigger: z.string().optional(),
      warnings: z.array(z.string()).optional(),
    })
    .passthrough()
    .optional(),
  success: z.boolean(),
  error: z.string().optional(),
  time_in: z.string().datetime(),
  time_out: z.string().datetime(),
  req_id: z.number().optional(),
});

export const WsStatusMessage = z.object({
  channel: z.literal('status'),
  type: z.literal('update'),
  data: z
    .array(
      z.object({
        api_version: z.literal('v2'),
        // Observed > Number.MAX_SAFE_INTEGER — loses precision in any JS JSON
        // parser (TEST_PLAN.md §7). Fine as a connection label, unusable as a key.
        connection_id: z.number(),
        system: z.enum(['online', 'maintenance', 'cancel_only', 'post_only']),
        version: z.string(),
      }),
    )
    .length(1),
});

// Heartbeat is exactly {channel} today; strict() turns any added field into
// visible drift instead of silently ignored payload.
export const WsHeartbeat = z.object({ channel: z.literal('heartbeat') }).strict();

export const WsTickerData = z.object({
  symbol: z.string(),
  bid: z.number(),
  bid_qty: z.number(),
  ask: z.number(),
  ask_qty: z.number(),
  last: z.number(),
  volume: z.number(),
  vwap: z.number(),
  low: z.number(),
  high: z.number(),
  change: z.number(),
  change_pct: z.number(),
  timestamp: z.string().datetime(),
});

export const WsTickerMessage = z.object({
  channel: z.literal('ticker'),
  type: z.enum(['snapshot', 'update']),
  data: z.array(WsTickerData),
});

export const WsBookLevel = z.object({
  price: z.number(),
  // qty 0 is meaningful (level deletion), so nonnegative — not positive.
  qty: z.number().nonnegative(),
});

export const WsBookData = z.object({
  symbol: z.string(),
  bids: z.array(WsBookLevel),
  asks: z.array(WsBookLevel),
  checksum: z.number().int(),
  timestamp: z.string().datetime(),
});

export const WsBookMessage = z.object({
  channel: z.literal('book'),
  type: z.enum(['snapshot', 'update']),
  data: z.array(WsBookData),
});

export type WsTickerDataT = z.infer<typeof WsTickerData>;
export type WsBookDataT = z.infer<typeof WsBookData>;

/**
 * Dispatcher for the contract sweep: given any raw WS v2 message, return the
 * schema that must accept it. Unknown channels/methods return null so the
 * sweep can flag them as unpinned message types instead of skipping silently.
 */
export function schemaForWsMessage(msg: Record<string, unknown>): z.ZodTypeAny | null {
  if (typeof msg['method'] === 'string') return WsSubscribeAck;
  switch (msg['channel']) {
    case 'status':
      return WsStatusMessage;
    case 'heartbeat':
      return WsHeartbeat;
    case 'ticker':
      return WsTickerMessage;
    case 'book':
      return WsBookMessage;
    default:
      return null;
  }
}
