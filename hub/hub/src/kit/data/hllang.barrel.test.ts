// HlLang reaches pages through the @kit barrel (the type of CodeBlock / CodeEditor `lang`), so a page names its
// languages by type instead of by hand. The assignment fails the typecheck when the barrel drops it.
import { describe, expect, it } from 'vitest';
import type { HlLang } from '@kit';
import { HL_LANGS } from './highlight';

describe('HlLang from @kit', () => {
  it('is the highlighter languages type', () => {
    const langs: readonly HlLang[] = HL_LANGS;
    const json: HlLang = 'json';
    expect(langs).toContain(json);
  });
});
