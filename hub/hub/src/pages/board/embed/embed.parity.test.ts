// The port gives the SDK's answer for every stored vector: the same URL, or the same refusal code and field.
// The vectors (vectors.json) are the SDK's own answers, kept current by embed.sync.test.ts.
import { describe, expect, it } from 'vitest';
import { buildEmbedUrl, type EmbedTarget } from './build';
import type { Catalog } from './catalog';
import catalog from './catalog.ui.json';
import file from './vectors.json';
import { decodeVector, VECTOR_DOMAIN, VECTOR_TARGET, type VectorInput } from './vectors';

type Stored = VectorInput & { expect: { url: string } | { refused: string; field: string | null } };
const CAT = catalog as unknown as Catalog;
const VECTORS = decodeVector((file as unknown as { vectors: Stored[] }).vectors);

function port(v: Stored) {
  const r = buildEmbedUrl(CAT, v.kit, (v.target ?? VECTOR_TARGET) as EmbedTarget, { view: v.view, index: v.index, params: v.params, query: v.query }, { computersDomain: v.domain ?? VECTOR_DOMAIN });
  return 'url' in r ? { url: r.url } : { refused: r.refused, field: r.field };
}

describe('tile URLs: the port answers as the SDK buildEmbedUrl', () => {
  it('holds vectors for URLs and for refusals', () => {
    expect(VECTORS.filter((v) => 'url' in v.expect).length).toBeGreaterThan(150);
    expect(new Set(VECTORS.map((v) => ('refused' in v.expect ? v.expect.refused : 'url'))).size).toBeGreaterThan(15);
  });
  it.each(VECTORS.map((v) => [v.id, v] as const))('%s', (_id, v) => {
    expect(port(v)).toEqual(v.expect);
  });
});
