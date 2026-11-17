// Every token kit/tokens.css declares belongs to exactly one layer, and every entry of the
// layers map still matches at least one declared token. An exact entry dies with its token; a wildcard entry stays live
// while any declared token still matches it, so deleting one member of a family does not flag the family's entry.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TOKEN_LAYERS, tokenLayerMatches, type TokenLayer } from './tokenLayers';

const css = readFileSync(join(import.meta.dirname, 'tokens.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const declared = [...new Set([...css.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]!))].sort();

describe('token layers (TOKEN_LAYERS)', () => {
  it('reads the declared tokens', () => {
    expect(declared.length).toBeGreaterThan(250);
  });

  it('puts every declared token in exactly one entry of one layer', () => {
    const off = declared
      .map((name) => ({ name, hits: tokenLayerMatches(name).map((h) => `${h.layer}:${h.entry}`) }))
      .filter((x) => x.hits.length !== 1);
    expect(off).toEqual([]);
  });

  it('has no entry that matches no declared token', () => {
    const dead = (Object.keys(TOKEN_LAYERS) as TokenLayer[]).flatMap((layer) =>
      TOKEN_LAYERS[layer]
        .filter((entry) => !declared.some((name) => (entry.endsWith('*') ? name.startsWith(entry.slice(0, -1)) : name === entry)))
        .map((entry) => `${layer}:${entry}`),
    );
    expect(dead).toEqual([]);
  });

  it('places the motion roles and the page-named colours by the design', () => {
    for (const name of ['--dur-press', '--dur-hover', '--dur-enter', '--dur-exit', '--dur-loop']) {
      expect(tokenLayerMatches(name).map((h) => h.layer), name).toEqual(['role']);
    }
    for (const name of ['--dur-0', '--dur-1', '--dur-2', '--dur-3', '--dur-4']) {
      expect(tokenLayerMatches(name).map((h) => h.layer), name).toEqual(['primitive']);
    }
    for (const name of ['--hx-cc-head', '--hx-tag-ok-bg']) {
      expect(tokenLayerMatches(name).map((h) => h.layer), name).toEqual(['component']);
    }
  });
});
