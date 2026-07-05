import type { APIRequestContext } from '@playwright/test';
import { publicGet } from '../clients/rest.js';
import { AssetPairsEnvelope, type AssetPairInfoT } from '../schemas/asset-pairs.js';
import { parseOrFail } from '../schemas/common.js';
import { PAIRS, type PairFixture } from './pairs.js';

let cached: Promise<Record<string, AssetPairInfoT>> | null = null;

/**
 * AssetPairs metadata (decimals, ordermin, …) is static reference data that
 * several projects need; fetching it once per process keeps the suite inside
 * the rate budget instead of re-paying 1.1s per consumer.
 */
export async function assetPairMetadata(
  request: APIRequestContext,
): Promise<Record<string, AssetPairInfoT>> {
  cached ??= publicGet(request, 'AssetPairs', {
    pair: PAIRS.map((p) => p.restQuery).join(','),
  }).then((body) => parseOrFail(AssetPairsEnvelope, body, 'AssetPairs').result);
  return cached;
}

export async function metadataFor(
  request: APIRequestContext,
  pair: PairFixture,
): Promise<AssetPairInfoT> {
  const all = await assetPairMetadata(request);
  const info = all[pair.restKey];
  if (!info) throw new Error(`AssetPairs result has no key ${pair.restKey}`);
  return info;
}
