// Vitest: the Files page's public hrefs. `file` names one file for Preview: its folder as the pane's path, its name as
// the row to open, and the computer's id when the caller knows it (the pane then resolves that id alone).
import { describe, expect, it } from 'vitest';
import { links } from './hrefs';
import { startHref } from './logic';

const q = (href: string) => Object.fromEntries(new URLSearchParams(href.split('?')[1] ?? ''));

describe('files hrefs', () => {
  it('file opens the named file in Preview, in its folder', () => {
    expect(q(links.file('atlas.00a1', '/srv/app/package.json'))).toEqual({ computer: 'atlas.00a1', path: '/srv/app', select: 'package.json', open: 'preview' });
    // A file in the top folder keeps no path key, as `at` does.
    expect(q(links.file('atlas.00a1', '/notes.txt'))).toEqual({ computer: 'atlas.00a1', select: 'notes.txt', open: 'preview' });
  });

  it('file carries the computer id when given, so a handle two computers share still names one', () => {
    expect(q(links.file('atlas.00a1', '/srv/a b.txt', 'c0a7150000000000000000a1'))).toEqual({ computer: 'atlas.00a1', path: '/srv', select: 'a b.txt', open: 'preview', cid: 'c0a7150000000000000000a1' });
  });

  it('a path that names no file is the folder link, never a Preview ask', () => {
    expect(links.file('atlas.00a1', '/')).toBe(links.at('atlas.00a1', '/'));
    expect(links.file('atlas.00a1', '/srv/')).toBe(links.at('atlas.00a1', '/srv'));
  });

  it('the page reads the link it gives: pane A on the folder, the row selected, Preview asked once', () => {
    const start = startHref(q(links.file('atlas.00a1', '/srv/app/package.json', 'c0a7150000000000000000a1')));
    expect(q(start ?? '')).toEqual({ a: 'atlas.00a1', ap: '/srv/app', acid: 'c0a7150000000000000000a1', asel: 'package.json', aopen: 'preview' });
  });
});
