# Test Plan — Kraken Public API Suite

Automated verification of Kraken's public **REST** (`https://api.kraken.com/0/public/*`) and
**WebSocket v2** (`wss://ws.kraken.com/v2`) market-data APIs, written as a proof-of-work
portfolio for the Sr. QA Automation Engineer — Pro role.

## 1. Scope

### In scope (v1)

| Area             | Surface                                                                     | What is verified                                                         |
| ---------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| REST market data | `SystemStatus`, `AssetPairs`, `Ticker`, `Depth`, `OHLC`, `Trades`, `Spread` | Domain invariants a trader relies on (see §2)                            |
| Contract         | Every REST response + every WS v2 message type                              | Zod `safeParse` — schema drift fails with the exact offending field path |
| WebSocket v2     | `ticker`, `book` (depth 10), `heartbeat`, subscribe/unsubscribe lifecycle   | Live stream behaviour, CRC32 book checksum, clean teardown               |
| Cross-source     | REST Ticker ↔ WS ticker, REST Depth ↔ WS book snapshot                      | The two data paths describe the same market                              |

Pairs under test: **XBT/USD, ETH/USD, XBT/EUR** — the two deepest books plus one non-USD
quote to catch currency-specific precision bugs.

### Out of scope (v1)

- **Private endpoints** — no API keys exist in this repo, by design. Nothing here can place,
  amend, or cancel an order.
- Order placement / lifecycle (see README "What I'd test next" — Kraken Futures demo).
- Load / latency benchmarking — a public shared endpoint is the wrong place to generate load,
  and results would measure my network, not Kraken.
- WebSocket v1 (`wss://ws.kraken.com`) — superseded by v2; testing both doubles maintenance
  for no added product risk.
- UI (kraken.com / Kraken Pro web) — different test type, different repo.

## 2. Risk analysis — what actually hurts traders

Ordered by potential damage. Each risk maps to at least one automated check.

| #   | Risk                                                                                        | Trader impact                                                                                                        | Covering tests                                                                                    |
| --- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 1   | **Crossed book** (best bid ≥ best ask)                                                      | Signals feed corruption; algos that trust it will "arbitrage" phantom liquidity and get filled at real, worse prices | `rest/depth` bid<ask, `ws/book` invariants, `cross/` top-of-book                                  |
| 2   | **Stale data** (stream silently stops, REST serves old snapshot)                            | Trader prices orders off a dead market; stop-losses fire late or never                                               | `ws/ticker` ≥3 updates in 30 s, `ws/heartbeat` cadence, timestamp monotonicity in `Trades`/`OHLC` |
| 3   | **Book desync** (missed/misapplied delta)                                                   | Client-side book diverges from the matching engine — the trader sees liquidity that is not there                     | `ws/book` CRC32 checksum after every applied update (flagship test)                               |
| 4   | **Schema drift** (field renamed, type changed, enum widened)                                | Parsers crash or, worse, silently mis-parse — `price` as string vs number changes rounding paths                     | entire `contract/` project                                                                        |
| 5   | **Precision / decimals errors** (price or lot decimals disagree with `AssetPairs` metadata) | Rounding at the wrong decimal = mispriced orders; on XBT/EUR a 1-decimal price rounded to 0 decimals is a whole euro | `rest/depth` decimals-conform check, `rest/asset-pairs` metadata presence                         |
| 6   | **Self-inconsistent candles/trades** (OHLC where low > open, trade sides outside {b,s})     | Backtests and charting silently corrupt                                                                              | `rest/ohlc`, `rest/trades`                                                                        |
| 7   | **REST vs WS divergence**                                                                   | Trader charts off REST, executes off WS — decisions made on one market, filled on another                            | `cross/` project                                                                                  |

## 3. Manual vs automated split

**Automated (this repo):** everything deterministic and machine-checkable — invariants,
schemas, stream liveness, checksum math, cross-source consistency. These run on every PR and
nightly, because API regressions ship on Kraken's schedule, not ours.

**Manual / exploratory (deliberately not automated):**

- Documentation accuracy review (docs vs observed behaviour → logged in §7 below).
- Behaviour during real market events (halts, upgrades, extreme volatility) — not
  reproducible on demand; observe and convert findings into new invariants.
- Rate-limit _boundary_ probing — intentionally tripping HTTP 429 on a shared public API is
  abusive from CI; verified once manually, guarded client-side thereafter.
- New-endpoint reconnaissance before automating (shape, timing, flakiness of the real feed).

## 4. Environments

| Env    | Value                                                                                               |
| ------ | --------------------------------------------------------------------------------------------------- |
| REST   | `https://api.kraken.com/0/public` (production — Kraken has no public sandbox for spot market data)  |
| WS     | `wss://ws.kraken.com/v2` (production)                                                               |
| Runner | Node ≥ 20, Playwright Test; local dev + GitHub Actions `ubuntu-latest`                              |
| Config | No secrets, no `.env` required. `npm ci && npx playwright test` from a fresh clone is the contract. |

Testing against production public endpoints is safe here because every call is read-only and
rate-limited client-side (§5).

## 5. Rate-limit strategy

Kraken's public REST endpoints allow roughly 1 request/second per IP before HTTP 429 /
`EAPI:Rate limit exceeded`. Policy:

- **Client-side guard:** the shared REST client serialises all requests through a queue with a
  minimum spacing of **1100 ms** (10% safety margin). Tests never call `fetch` directly.
- **Playwright `workers: 1` for the `rest`/`contract`/`cross` projects** — parallel workers
  would defeat the queue (separate processes, separate queues).
- **429 is a test failure, not a retry-and-hide:** if the guard is correct we should never see
  429; seeing one means the guard regressed.
- WS has no comparable request budget for subscriptions at this scale (3 pairs, 3 channels);
  connections are limited per IP, so the suite reuses one connection per test file.

## 6. Flake policy

- `retries: 1` in `playwright.config.ts` — one retry absorbs genuine network blips against a
  live production API.
- **Every retried test is a signal, not noise:** a custom reporter writes any test that needed
  a retry to `flake-report.json` (uploaded as a CI artifact). A test that keeps appearing
  there gets redesigned, not re-retried.
- No sleeps anywhere. All waits are event-driven with explicit timeouts (WS message
  predicates, Playwright's built-in expect polling).
- Live-market tolerances are explicit and documented (§8), never widened silently to make a
  red run green.

## 7. API observations (exploratory findings)

Discrepancies between documentation and observed behaviour get logged here — silently coding
around them would erase the signal.

- **Pair naming is inconsistent across API generations.** REST accepts `XBTUSD` but returns
  the result keyed `XXBTZUSD`; the same pair's `wsname` field says `XBT/USD` (the WS **v1**
  name), while WS **v2** only accepts `BTC/USD`. The suite carries an explicit per-pair
  mapping fixture (`src/fixtures/pairs.ts`) rather than deriving names, and treats `wsname`
  as v1-legacy metadata.
- **REST prices are strings, WS v2 prices are JSON numbers.** Same market, two serialisations.
  Contract schemas encode each faithfully instead of coercing, so a drift in either direction
  is caught.
- _(section grows as the suite runs — see git history)_

## 8. Cross-source tolerance reasoning

REST Ticker and WS ticker are sampled at different instants over a live market, so exact
equality is the wrong assertion. Tolerance: **last price within 0.5%** and **REST best
bid/ask within 0.5%** of the WS value, sampled as close together as the rate-limit guard
allows. Rationale: 0.5% is far above normal intra-second drift on XBT/ETH majors (typically
< 0.05%) but far below a wrong-pair / wrong-scale bug (×10 decimal error = 900%). The check
targets "same market, same magnitude", not tick-equality. Top-of-book comparison additionally
allows the books to differ by one price level, since a snapshot taken 1–2 s apart legitimately
moves one tick.
