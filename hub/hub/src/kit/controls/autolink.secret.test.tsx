// Vitest: autolink() never puts a secret address on screen. A text holding a 24-hex id anywhere
// (safeShown) comes back as the mask, whole. An address it leaves as plain text (userinfo, a
// query, a fragment) shows as its scheme and bullets when it is asked secret; any other such address stays exactly as
// written, and text without a link comes back as a string.
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { autolink } from './Link';

const HEX = '0123456789abcdef01234567';

describe('autolink: plain-text addresses that are secret', () => {
  it('a text holding a secret-shaped address (a query, a fragment or userinfo too) comes back as the mask, whole, as a string', () => {
    expect(autolink(`https://${HEX}.example.net/files?x=1`)).toBe('••••');
    expect(autolink(`see http://${HEX}.example.net/#top now`)).toBe('••••');
    expect(autolink(`at https://user@${HEX}.example.net/files.`)).toBe('••••');
  });

  it('secret: true masks a plain-text address of any shape', () => {
    expect(autolink('https://example.com/files?token=abc', { secret: true })).toBe('https://••••');
  });

  it('any other plain-text address stays exactly as written', () => {
    const text = 'see https://example.com/files?x=1 and https://user@example.org/a#b';
    expect(autolink(text)).toBe(text);
  });

  it('a secret address beside a link: the whole text is the mask, with no link', () => {
    const { container } = render(<p>{autolink(`https://example.com/docs or https://${HEX}.example.net/f?x=1`)}</p>);
    expect(container.querySelector('a, button')).toBeNull();
    expect(container.textContent).toBe('••••');
  });

  it('an address asked secret beside a link: the link stays, the masked one is text', () => {
    const { container } = render(<p>{autolink('https://example.com/docs or https://example.net/f?x=1', { secret: true })}</p>);
    expect(container.querySelector('button')).not.toBeNull();
    expect(container.textContent).toBe('https://•••• or https://••••');
    expect(container.innerHTML).not.toContain('example');
  });

  it('a quote inside userinfo does not end the address: the secret host is hidden, nothing is linked', () => {
    for (const q of [`'`, '"', '`']) {
      const text = `see https://user${q}foo@${HEX}.example.net/files?x=1 now`;
      const { container } = render(<p>{autolink(text)}</p>);
      expect(container.textContent).toBe('••••');
      expect(container.querySelector('a')).toBeNull();
    }
  });

  it('a non-secret address with a quote in its userinfo stays as written, with no partial link', () => {
    const text = "see https://user'foo@example.org/files now";
    expect(autolink(text)).toBe(text);
  });

  it('quotes and punctuation around addresses still end them', () => {
    const { container } = render(
      <p>{autolink(`'https://example.com/a', "https://example.org/b". \`https://example.net/c\`; 'https://example.info/?k=1'`)}</p>,
    );
    const hrefs = [...container.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(['https://example.com/a', 'https://example.org/b', 'https://example.net/c']);
    expect(container.textContent).toContain(`'https://example.info/?k=1'`);
  });

  it('two quoted addresses with no space between: each is judged on its own', () => {
    const { container } = render(<p>{autolink(`'https://example.com/a','https://u@example.net/'`, { secret: true })}</p>);
    expect(container.querySelector('a')).toBeNull();
    expect(container.textContent).toBe(`'https://••••','https://••••'`);
    expect(render(<p>{autolink(`'https://example.com/a','https://u@${HEX}.example.net/'`)}</p>).container.textContent).toBe('••••');
  });

  it('a quote inside the userinfo of a second address in the same run: its secret host is hidden', () => {
    for (const lead of ["https://example.com/a'", "https://example.com/a'x", 'https://example.com/a"']) {
      const { container } = render(<p>{autolink(`${lead}https://user'foo@${HEX}.example.com/ now`)}</p>);
      expect(container.querySelector('a')).toBeNull();
      expect(container.textContent).toBe('••••');
    }
  });

  it('a secret host after a quote is hidden whatever came before it in the run (no quote before the scheme)', () => {
    for (const lead of ['https://example.com/a', 'https://web.archive.org/web/2020/', 'https://u@example.com/a', 'https://example.com/a?x=']) {
      for (const q of ["'", '"', '`']) {
        for (const tail of [`${HEX}.example.com/`, `${HEX}/`, `x-${HEX}.example.com`]) {
          const { container } = render(<p>{autolink(`see ${lead}https://user${q}foo@${tail} now`)}</p>);
          expect(container.innerHTML).not.toContain(HEX);
        }
      }
    }
  });

  it('a secret host label in plain text is hidden, written or percent-encoded, with no address around it', () => {
    // The whole span shows as one mask: no part of a host that holds an id stays.
    expect(autolink(`host ${HEX}.example.com now`)).toBe('••••');
    expect(autolink(`'foo@${HEX.toUpperCase()}/x`)).toBe('••••');
    expect(autolink('host 0123456789%61bcdef01234567.example.com now')).toBe('••••');
  });

  it('a written id beside a percent-encoded one in the same run: both are hidden', () => {
    const text = autolink(`${HEX}.example,0123456789%61bcdef01234567.example`);
    expect(text).not.toContain(HEX);
    expect(text).not.toContain('0123456789%61bcdef01234567');
  });

  it('a host right after `//` is hidden even when no address is read there (a defanged address)', () => {
    expect(autolink(`see hxxps://${HEX}/ now`)).toBe('••••');
  });

  it('a host label inside an authority is hidden whatever host character stands before it', () => {
    for (const lead of ['_', '!', '~', 'x_', 'u@a_']) {
      for (const sep of ['//', '\\\\', '/\\']) {
        const text = autolink(`see hxxps:${sep}${lead}${HEX}/ now`);
        expect(text).not.toContain(HEX);
        expect(text).toContain('••••');
      }
    }
  });

  it('an id in a path is the mask, whole, like any id (no position is exempt)', () => {
    for (const text of [`see https://example.com/${HEX}?x=1 now`, `see https://example.com/files/${HEX}#top now`, `see https://example.com/files/${HEX} now`]) {
      expect(autolink(text)).toBe('••••');
    }
  });

  it('a long run of addresses is read in linear time', () => {
    const run = 'https://a/'.repeat(200_000);
    const t0 = performance.now();
    autolink(run);
    expect(performance.now() - t0).toBeLessThan(2000);
  });

  it('an id that is not a host label is the mask too (a commit in prose: an accepted false mask)', () => {
    const sha = `${HEX}0123456789abcdef`;
    for (const text of [`commit ${sha} landed`, `commit ${sha}.`, `see (${sha}), then`]) expect(autolink(text)).toBe('••••');
    expect(autolink(`commit ${sha.slice(0, 12)} landed`)).toBe(`commit ${sha.slice(0, 12)} landed`);
  });

  it('an address with userinfo does not swallow a quoted address after it: that one still links', () => {
    const { container } = render(<p>{autolink("https://u@example.com/a'https://example.org/b")}</p>);
    expect([...container.querySelectorAll('a')].map((a) => a.getAttribute('href'))).toEqual(['https://example.org/b']);
    expect(container.textContent).toBe("https://u@example.com/a'https://example.org/b");
  });

  it('an inner address with no quote before it stays part of its link (an archive link)', () => {
    const { container } = render(<p>{autolink('see https://web.archive.org/web/2020/https://example.com/a now')}</p>);
    const hrefs = [...container.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(['https://web.archive.org/web/2020/https://example.com/a']);
  });
});
