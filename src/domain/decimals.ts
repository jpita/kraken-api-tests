/**
 * Count decimals that carry information. Kraken REST pads (e.g. a 1-decimal
 * pair's price arrives as "62655.40000" — TEST_PLAN.md §7), so raw decimal
 * count would false-positive; only non-zero tail digits violate precision.
 */
export function significantDecimals(numeric: string): number {
  const fraction = numeric.split('.')[1];
  if (!fraction) return 0;
  return fraction.replace(/0+$/, '').length;
}
