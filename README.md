# kraken-api-tests

[![tests](https://github.com/jpita/kraken-api-tests/actions/workflows/tests.yml/badge.svg)](https://github.com/jpita/kraken-api-tests/actions/workflows/tests.yml)

Automated test suite for Kraken's **public REST** (`/0/public/*`) and **WebSocket v2**
(`wss://ws.kraken.com/v2`) market-data APIs. I built this as preparation for Kraken's
**Sr. QA Automation Engineer — Pro** role: it's a working demonstration of how I approach
testing a trading platform — risk analysis before code ([TEST_PLAN.md](TEST_PLAN.md) was
committed first, check the history), invariants a trader actually cares about instead of
snapshot assertions, contract pinning against live-captured payloads, and a flake policy
that treats retries as signal rather than noise.

## What each test class proves

| Project    | Proves                                                                                                                                                                                                                                                                                                                                    |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rest`     | The market data is _internally coherent_: books ordered and uncrossed, last trade inside the day's range, candles that don't lie about their range, time never runs backwards, precision conforms to the pair's own metadata.                                                                                                             |
| `contract` | Every REST response and every WS v2 message type still has the pinned shape (zod). Drift fails with the exact field path — including _new_ WS channels appearing, which the session sweep flags by design.                                                                                                                                |
| `ws`       | The stream is _alive and correct_: subscribe acks, ≥3 ticker updates in 30s, heartbeat cadence, clean unsubscribe that actually stops data. Flagship: the client-side order book replicated from snapshot+deltas reproduces Kraken's own CRC32 checksum after **every** update — the strongest possible proof against silent book desync. |
| `cross`    | REST and WS describe _the same market_ (top-of-book and ticker within a documented, reasoned tolerance) — a trader charting off one and executing off the other isn't being lied to.                                                                                                                                                      |

No API keys, no secrets, no order placement — public endpoints only, rate-limited
client-side to stay a polite API citizen (~1 req/s with a 10% margin).

## Run it

```bash
npm ci
npx playwright test            # full suite against the live API
npx playwright test --project=ws     # just the WebSocket tests
npx playwright show-report     # HTML report
```

Requires Node ≥ 20. No browsers, no `.env`, nothing to configure — a fresh clone runs.

CI runs the suite on every PR/push and on demand (`workflow_dispatch` — in a team setting
this would be a nightly cron, since drift ships on Kraken's schedule, not ours), uploading
the HTML report and — if any test needed a retry — a `flake-report.json` artifact, per the
flake policy in [TEST_PLAN.md §6](TEST_PLAN.md).

## What I'd test next with private-endpoint access

The natural v2 is the **order lifecycle on Kraken Futures demo** (demo-futures.kraken.com),
where placing real orders is free and safe:

- **Place / cancel / amend** for limit, market, stop-loss, and take-profit orders —
  state transitions (`pending → open → filled/canceled`) asserted via both the REST
  response and the private WS execution feed, never assumed.
- **Post-only**: must reject (not cross) when it would take liquidity.
- **Reduce-only**: must never increase a position, including the partial-fill edge cases.
- **Self-trade prevention**: two own orders that would match must trigger the configured
  STP behaviour, not a wash trade.
- **Idempotency & error contracts**: duplicate `cliOrdId`, insufficient margin, precision
  violations (an order priced off `tick_size` must be rejected with the documented error,
  not silently rounded).
- Cross-checking the private execution feed against the public trade tape — my own fill
  must appear on the public tape with matching price/qty/timestamp.

## Repo map

```
TEST_PLAN.md          scope, risk analysis, rate-limit + flake policy, API observations
SKILL.md              Claude Code skill: how to extend this suite (my AI-augmented QA workflow)
playwright.config.ts  projects: rest | contract | ws | cross
src/clients/          REST client (rate-limit queue, typed errors) + WS v2 helper (event-driven)
src/schemas/          zod schemas — the contract layer, pinned against live captures
src/domain/           order book replication + CRC32 checksum (verified against live data)
src/fixtures/         pair name mapping across Kraken's three naming schemes
tests/                the four projects
```
