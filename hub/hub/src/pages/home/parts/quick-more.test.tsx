// Start something, the More group: a label of its own under a rule, then the links on the tiles' two tracks.
//
// | # | Structure | Test |
// |---|---|---|
// | 1 | "More" names the list of links and stands right before it | 'More names its links' |
// | 2 | The label has a line to itself; the links stand on two equal tracks, as the tiles above | 'the links stand on two tracks under the label' |
import fs from 'node:fs';
import path from 'node:path';
import { within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderPage, screen } from '@app/testing';
import page from '../page';
import strings from '../strings.en.json';

const CSS = fs.readFileSync(path.join(__dirname, 'home.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const block = (sel: string) => {
  const m = new RegExp(`(?:^|\\})\\s*${sel.replace('.', '\\.')}\\s*\\{([^{}]*)\\}`).exec(CSS);
  return new Map((m?.[1] ?? '').split(';').flatMap((d) => { const i = d.indexOf(':'); return i > 0 ? [[d.slice(0, i).trim(), d.slice(i + 1).trim().replace(/\s+/g, ' ')] as const] : []; }));
};

describe('Home Start something: the More group', () => {
  it('More names its links', async () => {
    await renderPage(page, { path: '/home' });
    await screen.findByRole('heading', { level: 2, name: strings['actions.title'] });
    const list = await screen.findByRole('list', { name: strings['actions.more'] });
    const more = document.getElementById(list.getAttribute('aria-labelledby') ?? '');
    expect(more?.textContent).toBe(strings['actions.more']);
    // The label comes first, its list right after it, in one group.
    expect(more?.nextElementSibling).toBe(list);
    expect(within(list).getAllByRole('link').length).toBeGreaterThan(1);
  });

  it('the links stand on two tracks under the label', () => {
    expect(block('.more').get('flex-direction')).toBe('column');
    expect(block('.more').get('border-block-start')).toBeTruthy();
    expect(block('.moreList').get('display')).toBe('grid');
    // The same two tracks as the tiles above, so the links share the tiles' left edges.
    expect(block('.moreList').get('grid-template-columns')).toBe(block('.tiles').get('grid-template-columns'));
    expect(block('.moreList').get('grid-template-columns')).toBe('repeat(2, minmax(0, 1fr))');
  });
});
