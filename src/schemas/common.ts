import { z } from 'zod';

/**
 * Kraken REST serialises prices/volumes as strings (WS v2 uses JSON numbers —
 * TEST_PLAN.md §7). Schemas encode each faithfully instead of coercing so a
 * serialisation change in either API is caught as contract drift.
 */
export const NumericString = z
  .string()
  .regex(/^-?\d+(\.\d+)?$/, 'expected a decimal number serialised as string');

/** Every REST public endpoint wraps its payload in `{error: [], result: ...}`. */
export function krakenEnvelope<T extends z.ZodTypeAny>(result: T) {
  return z.object({
    error: z.array(z.string()).max(0, 'success response must carry an empty error array'),
    result,
  });
}

/**
 * safeParse that fails with the exact drifted field paths — the contract
 * layer's whole job is pointing at the field that moved.
 */
export function parseOrFail<T extends z.ZodTypeAny>(
  schema: T,
  data: unknown,
  label: string,
): z.infer<T> {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  ${i.path.length ? i.path.join('.') : '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Contract drift in ${label}:\n${issues}`);
  }
  return parsed.data as z.infer<T>;
}
