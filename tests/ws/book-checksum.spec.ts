import { expect, test } from '@playwright/test';
import { KrakenWs } from '../../src/clients/ws.js';
import { bookChecksum } from '../../src/domain/checksum.js';
import { applyBookMessage, emptyBook } from '../../src/domain/orderbook.js';
import { metadataFor } from '../../src/fixtures/pair-metadata.js';
import { PAIRS } from '../../src/fixtures/pairs.js';
import { parseOrFail } from '../../src/schemas/common.js';
import { WsBookMessage } from '../../src/schemas/ws.js';

const DEPTH = 10;
const UPDATES_TO_VERIFY = 10;

/**
 * Flagship test (TEST_PLAN.md §2 risk 3): replicate the book client-side from
 * snapshot + deltas and prove, via Kraken's own CRC32 checksum, that our copy
 * is byte-identical to the matching engine's view after EVERY update. A single
 * mismatch means a client following the documented protocol desyncs — the
 * worst silent failure a trading API can have.
 */
test.describe('WS book channel — CRC32 checksum', () => {
  for (const pair of PAIRS) {
    test(`${pair.wsSymbol}: snapshot + ${UPDATES_TO_VERIFY} applied deltas all checksum-verified`, async ({
      request,
    }) => {
      // Checksum strings are built at the pair's declared precision — metadata
      // and stream must agree or the checksum cannot reproduce.
      const meta = await metadataFor(request, pair);
      const ws = await KrakenWs.connect();
      try {
        await ws.subscribe({ channel: 'book', symbol: [pair.wsSymbol], depth: DEPTH });

        const isBook = (m: Record<string, unknown>) => m['channel'] === 'book';
        const snapshotMsg = parseOrFail(
          WsBookMessage,
          await ws.next((m) => isBook(m) && m['type'] === 'snapshot', {
            description: 'book snapshot',
          }),
          'book snapshot',
        );
        const snapshot = snapshotMsg.data[0];
        expect(snapshot, 'snapshot must carry exactly one book').toBeDefined();
        if (!snapshot) return;

        const book = emptyBook();
        applyBookMessage(book, snapshot, DEPTH);
        expect(book.bids).toHaveLength(DEPTH);
        expect(book.asks).toHaveLength(DEPTH);
        expect(
          bookChecksum(book, meta.pair_decimals, meta.lot_decimals),
          'snapshot checksum must reproduce from snapshot levels',
        ).toBe(snapshot.checksum);

        // Deltas must be applied in arrival order; collect preserves it.
        const since = ws.mark();
        const updates = await ws.collect((m) => isBook(m) && m['type'] === 'update', {
          count: UPDATES_TO_VERIFY,
          timeoutMs: 45_000,
          since,
          description: `book update (${pair.wsSymbol})`,
        });

        updates.forEach((raw, i) => {
          const update = parseOrFail(WsBookMessage, raw, `book update #${i}`).data[0];
          if (!update) throw new Error(`book update #${i} carried no data`);
          applyBookMessage(book, update, DEPTH);

          // The replicated book must stay structurally sane after every delta...
          expect(book.bids.length, `update #${i}: bid side must stay populated`).toBeGreaterThan(0);
          expect(book.asks.length, `update #${i}: ask side must stay populated`).toBeGreaterThan(0);
          const bestBid = book.bids[0]?.price ?? NaN;
          const bestAsk = book.asks[0]?.price ?? NaN;
          expect(bestBid, `update #${i}: crossed book after applying delta`).toBeLessThan(bestAsk);

          // ...and byte-identical to Kraken's: the CRC32 over top-10 formatted
          // levels must match the checksum Kraken computed server-side.
          expect(
            bookChecksum(book, meta.pair_decimals, meta.lot_decimals),
            `update #${i}: checksum mismatch — client book desynced from matching engine`,
          ).toBe(update.checksum);
        });
      } finally {
        await ws.close();
      }
    });
  }
});
