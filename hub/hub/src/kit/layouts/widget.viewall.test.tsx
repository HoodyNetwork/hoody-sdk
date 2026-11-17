// A Widget's View all keeps today's placement (after the actions, before the ⋯ menu) on every
// page; only a Widget whose viewAll says `end` (Home's card frame) puts it last, its text ending at the card's padding
// line. Every View all is link blue at rest and on hover. jsdom has no layout, so the
// proof is the header's order and the rules.
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Widget } from './Layouts';

const menu = [{ id: 'hide', label: 'Hide', onAction: () => undefined }];
const css = readFileSync(join(__dirname, 'Layouts.module.css'), 'utf8');
const rule = (sel: string) => css.match(new RegExp(`^${sel.replace(/\./g, '\\.').replace(/\[/g, '\\[')} \\{([^}]*)\\}`, 'm'))?.[1] ?? '';

/** The header's items in order: 'link' for View all, 'menu' for the ⋯ menu. */
function order() {
  const head = document.querySelector('header')!;
  return [...head.children].map((el) => (el.tagName === 'A' ? 'link' : el.querySelector('button') ? 'menu' : 'titles'));
}

describe('Widget View all placement (opt-in)', () => {
  it('without end: View all before the menu (every page but Home)', () => {
    render(<Widget title="Bots" viewAll={{ href: '/bots' }} menu={menu}>x</Widget>);
    expect(order()).toEqual(['titles', 'link', 'menu']);
    expect(screen.getByRole('link').className).not.toMatch(/viewAllEnd/);
  });

  it('with end: the menu first, View all last, with the end class', () => {
    render(<Widget title="Bots" viewAll={{ href: '/bots', end: true }} menu={menu}>x</Widget>);
    expect(order()).toEqual(['titles', 'menu', 'link']);
    expect(screen.getByRole('link').className).toMatch(/viewAllEnd/);
  });

  it('every View all is link blue and keeps it on hover; the end link takes its end padding back', () => {
    expect(rule('.viewAll')).toMatch(/color: var\(--hx-link\);/);
    expect(css).not.toMatch(/\.viewAll[^{]*\[data-hovered\][^{]*\{[^}]*color:/);
    expect(rule('.viewAll.viewAllEnd')).toMatch(/margin-inline-end: calc\(var\(--sp-1\) \* -1\);/);
  });
});
