import type { OrderBook } from './orderbook.js';

// Standard CRC-32 (IEEE 802.3, polynomial 0xEDB88320) — the variant Kraken uses
// for book checksums. Implemented inline to keep the algorithm auditable.
const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

export function crc32(input: string): number {
  let crc = 0xffffffff;
  for (let i = 0; i < input.length; i++) {
    crc = (CRC_TABLE[(crc ^ input.charCodeAt(i)) & 0xff] ?? 0) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Format one price/qty for the checksum string per the WS v2 book guide:
 * fix to the pair's decimal precision, drop the decimal point, strip leading zeros.
 * e.g. qty 0.001 @ 8 decimals -> "0.00100000" -> "000100000" -> "100000".
 */
export function formatChecksumValue(value: number, decimals: number): string {
  const stripped = value.toFixed(decimals).replace('.', '').replace(/^0+/, '');
  // An all-zero value ("0.00000000") strips to ""; Kraken never publishes zero
  // price levels, so surfacing that as "" would hide a book-maintenance bug.
  if (stripped === '') throw new Error(`Checksum input formatted to empty string: ${value}`);
  return stripped;
}

/**
 * CRC32 checksum of the top 10 levels: asks sorted price low->high, then bids
 * high->low, each level contributing formatted price immediately followed by
 * formatted qty. Matching Kraken's `checksum` field proves our replicated book
 * is byte-identical to the matching engine's view (TEST_PLAN.md §2 risk 3).
 */
export function bookChecksum(book: OrderBook, priceDecimals: number, qtyDecimals: number): number {
  const side = (levels: readonly { price: number; qty: number }[]): string =>
    levels
      .slice(0, 10)
      .map(
        (l) =>
          formatChecksumValue(l.price, priceDecimals) + formatChecksumValue(l.qty, qtyDecimals),
      )
      .join('');
  return crc32(side(book.asks) + side(book.bids));
}
