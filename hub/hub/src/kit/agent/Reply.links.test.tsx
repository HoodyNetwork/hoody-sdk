// Vitest: a Prose link is checked after the browser normalises its address. URL() decodes %XX
// in a host name and maps full-width letters to ASCII, so a key the written text hides from a scrub would surface in the link's
// href and its host tooltip. Such a link is drawn as text with its address scrubbed, for every Prose consumer.
import { render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { scrubSecrets } from './code';
import { Prose } from './Reply';

const KEY = 'abcdefghijklmnop1234';
const ENCODED = [`https://sk%2D${KEY}.example/setup`, `https://ｓｋ－${'ａｂｃｄｅｆｇｈｉｊｋｌｍｎｏｐ１２３４'}.example/`];
let unmount: (() => void) | null = null;
const draw = (text: string) => {
  const r = render(<Prose text={text} />);
  unmount = r.unmount;
  return r.container;
};
afterEach(() => {
  unmount?.();
  unmount = null;
});

describe('a Prose link whose normalised address shows a secret', () => {
  for (const url of ENCODED) {
    it(`is text, and the key is in no href, title or text (${url.slice(8, 14)}…)`, () => {
      const c = draw(`Docs: [CDN setup](${url}), [](${url}) and ${url} too`);
      expect(c.querySelectorAll('a')).toHaveLength(0);
      expect(c.querySelectorAll('[title]')).toHaveLength(0);
      expect(document.body.innerHTML).not.toContain(KEY);
      expect(c.textContent).toContain('CDN setup');
      expect(c.textContent).toContain('[hidden]');
    });
  }
  it('a written key in the path makes the link text too, the key hidden', () => {
    const c = draw(`Open https://api.example.com/v1?key=sk-${KEY} now`);
    expect(c.querySelectorAll('a')).toHaveLength(0);
    expect(c.textContent).toBe('Open https://api.example.com/v1?key=[hidden] now');
  });
});

describe('an ordinary Prose link', () => {
  it('stays a link', () => {
    const c = draw('See [the docs](https://docs.example.com/a?x=1) and https://example.org/b.');
    const links = [...c.querySelectorAll('a')];
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['https://docs.example.com/a?x=1', 'https://example.org/b']);
  });
});

describe('scrubSecrets, the one pattern the Hub hides', () => {
  it('hides key and bot-token shapes and leaves other text', () => {
    expect(scrubSecrets(`a sk-${KEY} b xoxb-${KEY} c 123456789:${'A'.repeat(30)} d`)).toBe('a [hidden] b [hidden] c [hidden] d');
    expect(scrubSecrets('sk-short and plain words')).toBe('sk-short and plain words');
    // A key whose tail is a token of another family (-ak-) is hidden whole, its start with it.
    expect(scrubSecrets(['bad key sk-12345678-ak-', 'Ab12Cd34Ef56Gh78Ij90'].join(''))).toBe('bad key [hidden]');
  });
});
