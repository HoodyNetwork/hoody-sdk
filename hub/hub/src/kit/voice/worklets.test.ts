// @vitest-environment node
// The voice worklets (core/voice-*.worklet.ts) call registerProcessor when they load, which is legal only in the
// AudioWorklet global. This proves no Hub module imports one as a module: every reference is a `?worker&url` URL.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(import.meta.dirname, '..', '..');

function sources(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules') sources(p, out); }
    else if (/\.(ts|tsx|mts)$/.test(e.name) && !/\.(test|spec)\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

describe('voice worklets load only by URL', () => {
  it('every import naming a voice worklet asks for its URL, and audio.ts names both', () => {
    const refs: string[] = [];
    for (const f of sources(SRC)) {
      for (const m of readFileSync(f, 'utf8').matchAll(/(?:import|from|import\()\s*['"]([^'"]*voice-[a-z]+\.worklet[^'"]*)['"]/g)) {
        refs.push(m[1]!);
        expect(m[1], f).toMatch(/\.worklet\.ts\?worker&url$/);
      }
    }
    expect(refs.sort()).toEqual(['@core/voice-capture.worklet.ts?worker&url', '@core/voice-playback.worklet.ts?worker&url']);
  });
});
