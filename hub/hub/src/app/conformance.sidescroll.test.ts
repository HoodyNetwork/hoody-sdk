// A spec checks "no sideways scroll" with noSideScroll (app/e2e.ts), never by reading document.documentElement: the page
// scrolls in #hub-main under an `overflow: clip`, so that box cannot overflow and the check cannot fail (shell/AppShell.module.css).
// kit/layouts/nosidescroll.spec.ts reads it on purpose, to prove the old read stays green on a page that overflows.
import { readdirSync, readFileSync } from 'node:fs';
import { join, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(import.meta.dirname, '..');
/**
 * A direct read, however it is spelled: a dot, an optional `?.` or a quoted bracket at either step, spaces, a non-null `!`.
 * An alias (`const el = document.documentElement`) is not followed. The text is read whole, so a read inside a comment
 * or a string counts too. That cuts both ways: it can fail a spec that never reads, and a leftover comment or string can
 * keep an OPEN spec in the blind set after its real read is gone. Strip such leftovers when a spec leaves OPEN.
 */
const BLIND =
  /(?<![\w$])document\s*(?:\??\.\s*(?:documentElement|scrollingElement)|(?:\?\.)?\s*\[\s*(['"`])(?:documentElement|scrollingElement)\1\s*\])\s*!?\s*(?:\??\.\s*scrollWidth|(?:\?\.)?\s*\[\s*(['"`])scrollWidth\2\s*\])/;

/** Each stays until its sideways overflow is fixed; then it moves to noSideScroll and leaves this list. */
const OPEN: Record<string, string> = {
  'kit/layouts/nosidescroll.spec.ts': 'the proof of the old read',
};

const specs = readdirSync(SRC, { recursive: true, encoding: 'utf8' })
  .map((f) => f.split(sep).join('/'))
  .filter((f) => /\.spec\.tsx?$/.test(f));

describe('sideways checks read #hub-main', () => {
  it('no spec reads the scrollWidth of a box that cannot overflow', () => {
    const blind = specs.filter((f) => BLIND.test(readFileSync(join(SRC, f), 'utf8')));
    expect(blind.sort()).toEqual(Object.keys(OPEN).sort());
  });

  it.each([
    'document.documentElement.scrollWidth',
    'document.scrollingElement!.scrollWidth',
    'document.documentElement!.scrollWidth',
    'document.scrollingElement?.scrollWidth',
    'document.scrollingElement !.scrollWidth',
    'document . documentElement\n  .scrollWidth',
    'document.documentElement?.scrollWidth',
    "document['documentElement'].scrollWidth",
    'document["scrollingElement"]!.scrollWidth',
    'window.document.documentElement.scrollWidth',
    'document[`documentElement`].scrollWidth',
    'document?.documentElement.scrollWidth',
    "document.documentElement['scrollWidth']",
    "document.scrollingElement?.['scrollWidth']",
    'document?. [ "scrollingElement" ] ! . scrollWidth',
    'document.documentElement ?. [ "scrollWidth" ]',
    'document.scrollingElement[`scrollWidth`]',
  ])('finds the blind read written as %j', (src) => {
    expect(BLIND.test(src)).toBe(true);
  });

  it.each(['main.scrollWidth', 'document.documentElement.clientWidth', 'document.documentElement.scrollHeight', 'document.body.scrollWidth', 'mydocument.documentElement.scrollWidth', '$document.documentElement.scrollWidth'])('leaves %j alone', (src) => {
    expect(BLIND.test(src)).toBe(false);
  });

  // An OPEN spec whose real read is gone but whose comment or string still holds a mismatched-quote spelling must not
  // match, or it would stay in the blind set and the guard would never say it can leave OPEN.
  it.each([
    `// the old read, removed: document['documentElement"].scrollWidth`,
    'const was = `document.scrollingElement[\'scrollWidth"]`;',
  ])('does not keep an OPEN spec blind on a mismatched quote: %j', (src) => {
    expect(BLIND.test(src)).toBe(false);
  });
});
