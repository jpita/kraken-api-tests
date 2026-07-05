export interface BookLevel {
  price: number;
  qty: number;
}

export interface OrderBook {
  /** Sorted price descending — best bid first. */
  bids: BookLevel[];
  /** Sorted price ascending — best ask first. */
  asks: BookLevel[];
}

export function emptyBook(): OrderBook {
  return { bids: [], asks: [] };
}

function applySide(
  levels: BookLevel[],
  updates: readonly BookLevel[],
  depth: number,
  ordering: (a: BookLevel, b: BookLevel) => number,
): BookLevel[] {
  const byPrice = new Map(levels.map((l) => [l.price, l]));
  for (const update of updates) {
    // qty 0 is Kraken's deletion marker for a price level (WS v2 book guide).
    if (update.qty === 0) byPrice.delete(update.price);
    else byPrice.set(update.price, update);
  }
  // Re-truncate to subscribed depth: Kraken sends no deletions for levels that
  // fall out of the window when a better-priced level pushes them out.
  return [...byPrice.values()].sort(ordering).slice(0, depth);
}

/** Apply a WS v2 book snapshot or update in place, maintaining sort + depth. */
export function applyBookMessage(
  book: OrderBook,
  msg: { bids: readonly BookLevel[]; asks: readonly BookLevel[] },
  depth: number,
): void {
  book.bids = applySide(book.bids, msg.bids, depth, (a, b) => b.price - a.price);
  book.asks = applySide(book.asks, msg.asks, depth, (a, b) => a.price - b.price);
}
