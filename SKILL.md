---
name: kraken-suite-extend
description: >
  How to extend the Kraken public API test suite with a new endpoint or WS channel.
  Use when asked to add coverage for a Kraken REST endpoint, WebSocket channel, or a
  new trading pair. Encodes the schema -> client -> rest test -> contract test ->
  cross-check pipeline this repo is built on.
---

# Extending the Kraken API test suite

This repo follows one pipeline for every new surface. Do the steps in order — each
layer feeds the next.

## 0. Reconnaissance first (never code from docs alone)

- Read the official docs page for the endpoint/channel (https://docs.kraken.com/api/).
- Then capture the REAL payload: `curl` for REST, a short `ws` probe script for WS.
  Docs and reality diverge (see TEST_PLAN.md §7); the schema gets pinned against
  reality, and any divergence gets a new bullet in §7 — that's exploratory signal,
  not an inconvenience.

## 1. Schema (`src/schemas/<endpoint>.ts`)

- One zod schema per endpoint/message type, wrapped in `krakenEnvelope()` for REST.
- REST numerics are strings → `NumericString`. WS v2 numerics are JSON numbers → `z.number()`.
- Pin enums closed (`z.enum`) — a widened enum is drift worth failing on.
- Use `.passthrough()` only for objects where Kraken adds fields additively
  (e.g. AssetPairs); use `.strict()` where any new field is signal (e.g. heartbeat).

## 2. Client (only if a new transport verb is needed)

- REST goes through `publicGet()` in `src/clients/rest.ts` — it owns the rate-limit
  queue. Never call `request.get` directly from a test; that bypasses the guard.
- WS goes through `KrakenWs` in `src/clients/ws.ts` — predicate-based `next`/`collect`
  with timeouts. No sleeps, ever; if you need a clock, count heartbeats.

## 3. Domain test (`tests/rest/<endpoint>.spec.ts` or `tests/ws/`)

- Loop over `PAIRS` from `src/fixtures/pairs.ts` (REST vs WS naming is pinned there).
- Assert market invariants, not exact values: ordering, monotonicity, bounds,
  uncrossed books, positivity. Every domain assertion gets a one-line comment with
  the market rationale (why a trader cares).
- Reuse `metadataFor()` for AssetPairs-derived precision instead of re-fetching.

## 4. Contract test (`tests/contract/`)

- REST: add the endpoint to the table in `rest-contracts.spec.ts`.
- WS: add the message schema to `schemaForWsMessage()` in `src/schemas/ws.ts` — the
  session sweep in `ws-contracts.spec.ts` then covers it automatically, and unknown
  channels fail the sweep by design.

## 5. Cross-check (`tests/cross/`) — when both transports expose the data

- Compare REST vs WS values with an explicit tolerance; document the tolerance
  reasoning in TEST_PLAN.md §8. Never widen a tolerance to green a run.

## 6. Before proposing a commit

- `npm run lint && npm run typecheck && npx playwright test` — a full green local
  run against the live API is the floor.
- New pair? Add it to `src/fixtures/pairs.ts` with all three names (restQuery,
  restKey, wsSymbol) verified via a live AssetPairs call, not guessed.
- Update TEST_PLAN.md: scope table, risk mapping if the new surface adds a risk,
  §7 if reality diverged from docs.
