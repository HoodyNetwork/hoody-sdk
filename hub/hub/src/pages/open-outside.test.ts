import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// A page opens an address outside the Hub only through the kit's openOutside (kit/states/openOutside.ts): on the web it
// is exactly hostEnv().openExternal; in a terminal with no browser it copies and shows the address instead of doing
// nothing. A page calling the host's openExternal itself would be silent over SSH again. Files are read from disk (a
// pages-root test may not import other pages: hub/page-boundaries). Tests may stub openExternal; they are skipped.
const PAGES = __dirname;
const CALL = /\bopenExternal\s*\??\.?\s*\(|\.openExternal\b(?!\s*:)/;

const files = (readdirSync(PAGES, { recursive: true }) as string[])
  .filter((f) => /\.(tsx?|mts)$/.test(f) && !/\.test\.|\.spec\.|fixtures?\./.test(f));

describe('pages open outside addresses through the kit', () => {
  it('no page file reaches the host openExternal itself', () => {
    const hits = files.filter((f) => readFileSync(join(PAGES, f), 'utf8').split('\n').some((l) => !/^\s*(\/\/|\*)/.test(l) && CALL.test(l)));
    expect(hits).toEqual([]);
  });
});
