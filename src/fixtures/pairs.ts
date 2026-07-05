/**
 * Kraken names the same market three different ways across API generations
 * (TEST_PLAN.md §7): REST accepts `XBTUSD`, keys the result `XXBTZUSD`, and
 * WS v2 only accepts `BTC/USD`. Deriving one from another is where bugs live,
 * so the mapping is pinned explicitly here.
 */
export interface PairFixture {
  /** Human label used in test titles */
  label: string;
  /** Value accepted by REST `?pair=` query params */
  restQuery: string;
  /** Key Kraken uses for this pair inside REST `result` objects */
  restKey: string;
  /** Symbol accepted by WebSocket v2 */
  wsSymbol: string;
}

export const PAIRS: readonly PairFixture[] = [
  { label: 'XBT/USD', restQuery: 'XBTUSD', restKey: 'XXBTZUSD', wsSymbol: 'BTC/USD' },
  { label: 'ETH/USD', restQuery: 'ETHUSD', restKey: 'XETHZUSD', wsSymbol: 'ETH/USD' },
  { label: 'XBT/EUR', restQuery: 'XBTEUR', restKey: 'XXBTZEUR', wsSymbol: 'BTC/EUR' },
] as const;
