// Vitest: an
// action that answers the thing right above it (a field's "Use <free address>") must stay on its line at every width.
// An ActionBar folds its secondaries into More below 600 px of content, which takes the action away from what it
// answers, so pages wrote their own <div> around a Button (the layout.actionRow debt). InlineActions is the kit place:
// never folded, a secondary each, at most three, ids and labels distinct, a group name once there are two.
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type ReactElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CONTENT_CONTAINER } from '../../media';
import { ActionBar, InlineActions } from './ActionBar';
import type { ActionSpec } from './types';

async function show(ui: () => ReactElement) {
  const router = createRouter({ routeTree: createRootRoute({ component: ui }), history: createMemoryHistory({ initialEntries: ['/'] }) });
  await act(async () => {
    render(<RouterProvider router={router} />);
    await router.load();
  });
}

const width = (el: HTMLElement | null, px: number) => {
  if (el) Object.defineProperty(el, 'clientWidth', { configurable: true, value: px });
};

afterEach(() => {
  document.getElementById('hub-main')?.remove();
});

/** A marked `content` container of `px`: a phone's (390) is below the ActionBar's 600 px fold. */
function Region({ px, children }: { px: number; children: ReactNode }) {
  return (
    <div {...{ [CONTENT_CONTAINER]: '' }} ref={(el) => width(el, px)}>
      {children}
    </div>
  );
}

const use: ActionSpec = { id: 'use-free', label: 'Use /fetch-2', onPress: () => undefined };

describe('InlineActions: never folded', () => {
  it('at 390 an ActionBar folds the same secondary into More; InlineActions keeps it drawn', async () => {
    await show(() => (
      <Region px={390}>
        <ActionBar label="Bar" secondary={[use]} />
        <InlineActions actions={[{ ...use, id: 'use-free-2', label: 'Use /fetch-3' }]} />
      </Region>
    ));
    const bar = screen.getByRole('group', { name: 'Bar' });
    expect(within(bar).queryByRole('button', { name: 'Use /fetch-2' })).toBeNull();
    expect(within(bar).getByRole('button', { name: 'More actions' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Use /fetch-3' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'More actions' })).toHaveLength(1);
  });

  it('the action runs on press', async () => {
    const onPress = vi.fn();
    await show(() => (
      <Region px={390}>
        <InlineActions actions={[{ ...use, onPress }]} />
      </Region>
    ));
    const b = screen.getByRole('button', { name: 'Use /fetch-2' });
    await userEvent.click(b);
    expect(onPress).toHaveBeenCalledTimes(1);
    const row = b.closest('[data-hub-inline-actions]');
    expect(row).not.toBeNull();
    // The control carries its size itself (the Button's sm plate), so a wrapped one keeps that size's height.
    expect(b.className.split(' ')).toContain('sm');
    // One action names no group of its own: it answers the field above it.
    expect(screen.queryByRole('group')).toBeNull();
  });

  it('one action is no group even with a label', async () => {
    await show(() => (
      <Region px={390}>
        <InlineActions label="Outcome" actions={[use]} />
      </Region>
    ));
    expect(screen.queryByRole('group')).toBeNull();
    expect(document.querySelector('[data-hub-inline-actions]')).not.toHaveAttribute('aria-label');
  });

  it('a md row draws md controls', async () => {
    await show(() => (
      <Region px={390}>
        <InlineActions size="md" actions={[use]} />
      </Region>
    ));
    expect(screen.getByRole('button', { name: 'Use /fetch-2' }).className.split(' ')).not.toContain('sm');
  });

  it('two or three actions are one named group, in order', async () => {
    const a = (id: string, label: string): ActionSpec => ({ id, label, onPress: () => undefined });
    await show(() => (
      <Region px={390}>
        <InlineActions label="Outcome" actions={[a('try', 'Try it'), a('open', 'Open'), a('again', 'Another')]} />
      </Region>
    ));
    const g = screen.getByRole('group', { name: 'Outcome' });
    expect(within(g).getAllByRole('button').map((b) => b.textContent)).toEqual(['Try it', 'Open', 'Another']);
  });

  it('a primary is drawn last, as the primary, and never folds at 390', async () => {
    const a = (id: string, label: string): ActionSpec => ({ id, label, onPress: () => undefined });
    await show(() => (
      <Region px={390}>
        <InlineActions label="Changes" actions={[a('discard', 'Discard')]} primary={a('put', 'Put in')} />
      </Region>
    ));
    const g = screen.getByRole('group', { name: 'Changes' });
    const bs = within(g).getAllByRole('button');
    expect(bs.map((b) => b.getAttribute('data-action-id'))).toEqual(['discard', 'put']);
    expect(bs[1]).toHaveAttribute('data-variant', 'primary');
    expect(bs[0]).not.toHaveAttribute('data-variant', 'primary');
    expect(screen.queryByRole('button', { name: 'More actions' })).toBeNull();
  });

  it('a primary alone is one action: no group', async () => {
    await show(() => (
      <Region px={390}>
        <InlineActions label="Changes" actions={[]} primary={use} />
      </Region>
    ));
    expect(screen.getByRole('button', { name: 'Use /fetch-2' })).toHaveAttribute('data-variant', 'primary');
    expect(screen.queryByRole('group')).toBeNull();
  });

  it('a link stays a link', async () => {
    await show(() => (
      <Region px={390}>
        <InlineActions actions={[{ id: 'docs', label: 'Read how', href: '/docs' }]} />
      </Region>
    ));
    expect(screen.getByRole('link', { name: 'Read how' })).toHaveAttribute('href', '/docs');
  });

  it('an action that turns disabled keeps the focus it had; focus elsewhere in the row stays', async () => {
    function Draft() {
      const [dirty, setDirty] = useState(true);
      return (
        <Region px={390}>
          <InlineActions
            label="Changes"
            actions={[{ id: 'discard', label: 'Discard', onPress: () => setDirty(false), ...(dirty ? {} : { disabledReason: 'Nothing changed' }) }]}
            primary={{ id: 'put', label: 'Put', onPress: () => setDirty(true) }}
          />
        </Region>
      );
    }
    await show(() => <Draft />);
    await userEvent.click(screen.getByRole('button', { name: 'Discard' }));
    const discard = screen.getByRole('button', { name: 'Discard' });
    expect(discard).toHaveAttribute('aria-disabled', 'true');
    expect(document.activeElement).toBe(discard);
    // Put redraws Discard enabled; the focus stays on Put, where the user put it.
    const put = screen.getByRole('button', { name: 'Put' });
    await userEvent.click(put);
    expect(screen.getByRole('button', { name: 'Discard' })).not.toHaveAttribute('aria-disabled');
    expect(document.activeElement).toBe(put);
  });

  it('a fourth action goes into the kit More menu after the primary, never drawn', async () => {
    const onPress = vi.fn();
    await show(() => (
      <Region px={390}>
        <InlineActions
          label="Band"
          actions={[{ id: 'a', label: 'Alpha', onPress: () => undefined }, { id: 'b', label: 'Beta', onPress: () => undefined }]}
          primary={{ id: 'p', label: 'Go', onPress: () => undefined }}
          more={[{ id: 'd', label: 'Discard', onAction: onPress }]}
        />
      </Region>
    ));
    const row = screen.getByRole('group', { name: 'Band' });
    const buttons = within(row).getAllByRole('button');
    expect(buttons.map((b) => b.textContent)).toEqual(['Alpha', 'Beta', 'Go', expect.anything()]);
    expect(buttons[3]).toHaveAccessibleName('More actions');
    expect(within(row).queryByRole('button', { name: 'Discard' })).toBeNull();
    await userEvent.click(within(row).getByRole('button', { name: 'More actions' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Discard' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('one action and a More menu are a named group', async () => {
    await show(() => (
      <Region px={390}>
        <InlineActions label="Band" actions={[]} primary={use} more={[{ id: 'd', label: 'Discard', onAction: () => undefined }]} />
      </Region>
    ));
    expect(screen.getByRole('group', { name: 'Band' })).toBeInTheDocument();
  });

  it('nothing to show draws nothing', async () => {
    await show(() => (
      <Region px={390}>
        <InlineActions actions={[]} />
      </Region>
    ));
    expect(document.querySelector('[data-hub-inline-actions]')).toBeNull();
  });
});

describe('InlineActions: refused shapes (dev builds and tests)', () => {
  const a = (id: string, label: string): ActionSpec => ({ id, label, onPress: () => undefined });
  const quiet = () => vi.spyOn(console, 'error').mockImplementation(() => undefined);
  it('more than three: those belong in a section ActionBar', () => {
    const e = quiet();
    expect(() => render(<InlineActions label="X" actions={[a('1', 'One'), a('2', 'Two'), a('3', 'Three'), a('4', 'Four')]} />)).toThrow(/at most 3/);
    e.mockRestore();
  });
  it('a More menu needs a group name and may not repeat a drawn action', () => {
    expect(() => render(<InlineActions actions={[]} primary={use} more={[{ id: 'd', label: 'Discard', onAction: () => undefined }]} />)).toThrow(/group label/);
    expect(() => render(<InlineActions label="B" actions={[]} primary={use} more={[{ id: use.id, label: use.label, onAction: () => undefined }]} />)).toThrow(/twice/);
  });

  it('a primary counts toward the three and the group name, and may not repeat a secondary', () => {
    const e = quiet();
    expect(() => render(<InlineActions label="X" actions={[a('1', 'One'), a('2', 'Two'), a('3', 'Three')]} primary={a('4', 'Four')} />)).toThrow(/4 actions; at most 3/);
    expect(() => render(<InlineActions actions={[a('1', 'One')]} primary={a('2', 'Two')} />)).toThrow(/group label/);
    expect(() => render(<InlineActions label="X" actions={[a('1', 'One')]} primary={a('2', 'One')} />)).toThrow(/label "One" appears twice/);
    e.mockRestore();
  });
  it('two actions with no group name', () => {
    const e = quiet();
    expect(() => render(<InlineActions actions={[a('1', 'One'), a('2', 'Two')]} />)).toThrow(/group label/);
    e.mockRestore();
  });
  it('a repeated id or label', () => {
    const e = quiet();
    expect(() => render(<InlineActions label="X" actions={[a('1', 'One'), a('1', 'Two')]} />)).toThrow(/id "1" appears twice/);
    expect(() => render(<InlineActions label="X" actions={[a('1', 'One'), a('2', 'One')]} />)).toThrow(/label "One" appears twice/);
    e.mockRestore();
  });
});

describe('InlineActions CSS: wraps, never clips', () => {
  it('the row wraps', () => {
    const css = readFileSync(join(__dirname, 'anatomy.module.css'), 'utf8');
    expect(css).toMatch(/\.inline \{[^}]*flex-wrap: wrap;/);
    expect(css).not.toMatch(/\.inline \{[^}]*overflow: hidden/);
  });

  it('one action wider than the row wraps its own words, whole', () => {
    const css = readFileSync(join(__dirname, 'anatomy.module.css'), 'utf8');
    const rule = (sel: string) => css.match(new RegExp(`${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`))?.[1] ?? '';
    expect(rule('.inline :is(a[href], button)')).toMatch(/min-inline-size: 0;[^]*max-inline-size: 100%;[^]*white-space: normal;/);
    // It grows to its lines from the plate height its own size gives it, or the touch minimum when that is taller.
    expect(rule('.inline :is(a[href], button)')).toMatch(/block-size: auto;[^]*min-block-size: max\(var\(--plate-h\), var\(--inline-touch\)\);/);
    expect(rule('.inline > *')).toMatch(/min-inline-size: 0;[^]*max-inline-size: 100%;/);
    expect(css).toMatch(/@media \(pointer: coarse\) \{\s*\.inline \{\s*--inline-touch: var\(--touch-min\);/);
    // The label is reached by the Button's own hook; no rule still names the retired chip parts or a row-set height.
    expect(css).toMatch(/\.inline :is\(a\[href\], button\) > \[data-btn-label\] \{[^}]*overflow-wrap: anywhere;[^}]*text-overflow: clip;[^}]*white-space: normal;/);
    expect(css.replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/data-chip|--inline-h|inlineSm|--btn-req/);
  });
});
