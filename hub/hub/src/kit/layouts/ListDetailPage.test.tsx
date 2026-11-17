import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { type ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import { DetailBody, DetailFooter, DetailHeader, ListDetailPage, useSelection } from './ListDetailPage';
import { SubSection } from './anatomy/Section';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function Page({ mode = 'fill' as 'fill' | 'side' }) {
  const [sel] = useSelection();
  return (
    <ListDetailPage
      mode={mode}
      header={{ title: 'Things', primary: { label: 'New thing', onPress: () => undefined } }}
      list={<p>the list</p>}
      detail={sel ? <DetailHeader title={sel} actions={<button type="button">Run</button>} /> : null}
      detailFooter={sel ? <button type="button">Save</button> : undefined}
    />
  );
}

async function mount(path: string, el: () => ReactElement = () => <Page />) {
  const router = createRouter({ routeTree: createRootRoute({ component: el }), history: createMemoryHistory({ initialEntries: [path] }) });
  await act(async () => {
    render(<RouterProvider router={router} />);
    await router.load();
  });
  return router;
}

describe('ListDetailPage', () => {
  it('fill: Hide list keeps ?list=0; Show list takes its place at the end of the header actions and brings it back', async () => {
    const router = await mount('/?sel=atlas');
    const hide = screen.getByRole('button', { name: /Hide list/ });
    const actions = hide.parentElement;
    expect(actions?.lastElementChild).toBe(hide);
    await act(async () => fireEvent.click(hide));
    expect(router.state.location.search).toMatchObject({ sel: 'atlas', list: '0' });
    const show = screen.getByRole('button', { name: /Show list/ });
    // One pane control in one place: the title block leads the header, so the
    // title starts at the pane's inset with the list hidden as with it shown.
    expect(show.parentElement?.lastElementChild).toBe(show);
    // The page's buttons come first, then the end group (pane control, ⋯) after them.
    expect(screen.getByRole('button', { name: 'Run' }).parentElement?.nextElementSibling).toBe(show.parentElement);
    const header = show.closest('header');
    expect(header?.firstElementChild?.querySelector('[data-hub-title]')).not.toBeNull();
    expect(screen.queryByRole('button', { name: /Hide list/ })).toBeNull();
    await act(async () => fireEvent.click(show));
    expect(router.state.location.search).toEqual({ sel: 'atlas' });
  });

  it('fill: the pane control keeps focus across Hide list and Show list (one button, its label changes)', async () => {
    const router = await mount('/?sel=atlas');
    const ctl = screen.getByRole('button', { name: /Hide list/ });
    ctl.focus();
    await act(async () => fireEvent.click(ctl));
    expect(router.state.location.search).toMatchObject({ list: '0' });
    expect(screen.getByRole('button', { name: /Show list/ })).toBe(ctl);
    expect(document.activeElement).toBe(ctl);
    await act(async () => fireEvent.click(ctl));
    expect(router.state.location.search).toEqual({ sel: 'atlas' });
    expect(screen.getByRole('button', { name: /Hide list/ })).toBe(ctl);
    expect(document.activeElement).toBe(ctl);
  });

  it('fill: \\ toggles the list as a page key, but not while a dialog is open or in a field', async () => {
    const router = await mount('/?sel=atlas');
    await act(async () => fireEvent.keyDown(document.body, { key: '\\' }));
    expect(router.state.location.search).toMatchObject({ list: '0' });
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    const field = document.createElement('input');
    dialog.append(field);
    document.body.append(dialog);
    await act(async () => fireEvent.keyDown(document.body, { key: '\\' }));
    expect(router.state.location.search).toMatchObject({ list: '0' });
    dialog.remove();
    document.body.append(field);
    await act(async () => fireEvent.keyDown(field, { key: '\\' }));
    expect(router.state.location.search).toMatchObject({ list: '0' });
    field.remove();
    await act(async () => fireEvent.keyDown(document.body, { key: '\\' }));
    expect(router.state.location.search).toEqual({ sel: 'atlas' });
  });

  it('fill: ?list=0 does not outlive the detail', async () => {
    const router = await mount('/?sel=atlas&list=0');
    await act(async () => router.navigate({ to: '.', search: {} as never }));
    expect(router.state.location.search).toEqual({});
  });

  it('the header primary keeps its weight while a detail is open (regions)', async () => {
    await mount('/?sel=atlas');
    const primary = screen.getAllByRole('button', { name: /New thing/ })[0];
    expect(primary?.getAttribute('data-variant')).toBe('primary');
  });

  it('side: × closes the inspector; the footer renders below the detail', async () => {
    const router = await mount('/?sel=atlas', () => <Page mode="side" />);
    expect(screen.getByRole('button', { name: 'Save' }).closest('footer')).not.toBeNull();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Close/ })));
    expect(router.state.location.search).toEqual({});
  });
});

describe('ListDetailPage single pane (both pane minimums do not fit)', () => {
  it('switches on the page\'s own width at the sum of the pane minimums and the separator, read from the tokens', () => {
    const css = readFileSync(join(import.meta.dirname, 'ListDetailPage.module.css'), 'utf8');
    const tokens = readFileSync(join(import.meta.dirname, '../tokens.css'), 'utf8');
    const px = (src: string, name: string) => Number(new RegExp(`${name}:\\s*(\\d+)px`).exec(src)?.[1]);
    const sum = px(tokens, '--pane-list-min') + px(css, '--ld-sep') + px(tokens, '--detail-min');
    expect(sum).toBe(846);
    expect(css).toContain(`@container ldpage (width < ${sum}px)`);
    expect(css).not.toContain('@container content (width < 840px)');
    // The page is that container, measured inside its padding (content box).
    expect(css).toMatch(/\n\.page\s*\{[^}]*container:\s*ldpage \/ inline-size/);
    // The fill grid keeps the detail at its least width and reserves it from the tokens, not a literal.
    expect(css).toMatch(/\.fill\.hasDetail \.split\s*\{[^}]*calc\(100% - var\(--detail-min\) - var\(--ld-sep\)\)\)\) var\(--ld-sep\) minmax\(var\(--detail-min\), 1fr\)/);
    expect(css).not.toMatch(/566px/);
  });

  it('shows one way out: "‹ <page>" and no × or Hide list beside it (apps at 390)', () => {
    const css = readFileSync(join(import.meta.dirname, 'ListDetailPage.module.css'), 'utf8');
    const at = css.indexOf('@container ldpage (width < 846px)');
    const block = css.slice(at, css.indexOf('\n}\n', at));
    expect(block).toMatch(/\.back\s*\{\s*display:\s*block/);
    expect(block).toMatch(/(?:^|\n)\s*\.paneCtl\s*\{\s*display:\s*none/);
    // Show list is a paneCtl too: no separate class to forget in the one-pane rule.
    expect(css).not.toMatch(/paneShow/);
  });
});

describe('ListDetailPage banner', () => {
  function Banner({ mode = 'fill' as 'fill' | 'side' }) {
    const [sel] = useSelection();
    return (
      <ListDetailPage
        mode={mode}
        header={{ title: 'Things' }}
        banner={<p>the banner</p>}
        toolbar={<p>the toolbar</p>}
        list={<p>the list</p>}
        detail={sel ? <p>the detail</p> : null}
      />
    );
  }

  for (const mode of ['fill', 'side'] as const)
    for (const path of ['/', '/?sel=atlas'])
      it(`${mode}${path === '/' ? '' : ' with a selection'}: renders above both panes, outside the header and the list`, async () => {
        await mount(path, () => <Banner mode={mode} />);
        const banner = screen.getByText('the banner').parentElement!;
        const page = banner.parentElement!;
        const split = banner.nextElementSibling!;
        // A sibling of the header and the split, so the one-pane rule (it hides .header and .list) cannot take it.
        expect(split.contains(screen.getByText('the list'))).toBe(true);
        expect(banner.previousElementSibling?.contains(screen.getByRole('heading', { name: 'Things' }))).toBe(true);
        expect(page.children).toHaveLength(3);
        expect(split.contains(banner)).toBe(false);
        // The list's own toolbar stays in the list pane.
        expect(split.contains(screen.getByText('the toolbar'))).toBe(true);
      });

  it('draws nothing without a banner', async () => {
    await mount('/?sel=atlas');
    const split = screen.getByText('the list').closest('section')!.parentElement!;
    expect(split.parentElement!.children).toHaveLength(2);
  });

  it('the one-pane rule leaves the banner shown, and it is laid out like the DetailPage banner', async () => {
    const css = readFileSync(join(import.meta.dirname, 'ListDetailPage.module.css'), 'utf8');
    const at = css.indexOf('@container ldpage (width < 846px)');
    expect(css.slice(at, css.indexOf('\n}\n', at))).not.toMatch(/banner/);
    // One recipe: the banner and the list toolbar carry the notice stack class a DetailPage's banner carries, and their
    // own classes set no gap or padding beside it.
    const rule = (src: string, sel: RegExp) => (sel.exec(src)?.[1] ?? '').replace(/\s+/g, ' ').trim();
    const stack = rule(readFileSync(join(import.meta.dirname, 'Layouts.module.css'), 'utf8'), /\n\.noticeStack\s*\{([^}]*)\}/);
    for (const decl of ['display: flex;', 'flex-direction: column;', 'gap: var(--sp-2);', 'padding-block-end: var(--sp-3);']) expect(stack).toContain(decl);
    for (const own of [rule(css, /\n\.banner\s*\{([^}]*)\}/), rule(css, /\n\.listToolbar\s*\{([^}]*)\}/)]) expect(own).toBe('flex: none;');
    await mount('/', () => <Banner />);
    expect(screen.getByText('the banner').parentElement!.className).toMatch(/noticeStack/);
    expect(screen.getByText('the toolbar').parentElement!.className).toMatch(/noticeStack/);
  });
});

describe('ListDetailPage phone footer (< 600)', () => {
  it('the detail footer (Rent, Save) sticks to the bottom of the visible pane, above the bottom bar', () => {
    const css = readFileSync(join(import.meta.dirname, 'ListDetailPage.module.css'), 'utf8');
    const at = css.indexOf('@container content (width < 600px)');
    const phone = css.slice(at, css.indexOf('\n}\n', at));
    const footer = /\.detailFooter\s*\{([^}]*)\}/.exec(phone)?.[1] ?? '';
    expect(footer).toMatch(/position:\s*sticky/);
    // Sticky stops at .main's end padding: the offset subtracts the shell's own value, never a copy of its sum.
    expect(footer).toMatch(/inset-block-end:\s*calc\(var\(--ld-footer-bottom\) - var\(--shell-main-pad-end, 0px\) - var\(--shell-fab-room, 0px\)\)/);
    expect(css).not.toMatch(/--ld-main-pad/);
    // What the footer keeps clear is the shell's covered strip (bottom bar + safe area; 0 in focus mode), not a copy.
    expect(css).toMatch(/\.page\s*\{[^}]*--ld-footer-bottom:\s*var\(--shell-main-pad-end, 0px\)/);
  });
});

describe('ListDetailPage page end on phones (< 600)', () => {
  it('the page box itself clears the bottom bar, so a fixed-height wrapper cannot leave rows under it', () => {
    const css = readFileSync(join(import.meta.dirname, 'ListDetailPage.module.css'), 'utf8');
    const at = css.indexOf('@container content (width < 600px)');
    const phone = css.slice(at, css.indexOf('\n}\n', at));
    const page = /\n {2}\.page\s*\{([^}]*)\}/.exec(phone)?.[1] ?? '';
    expect(page).toMatch(/padding-block-end:\s*calc\(var\(--sp-4\) \+ var\(--shell-main-pad-end, 0px\)\)/);
    // A flex wrapper must not shrink the page below its content (the padding would land mid-content). The page is at least
    // the content area (min-height 100%), so a short list's questions sit at its bottom.
    expect(page).toMatch(/flex-shrink:\s*0/);
    expect(page).toMatch(/min-height:\s*100%/);
  });
});

describe('ListDetailPage phone footer with the keyboard open', () => {
  it('follows the visual viewport: a keyboard covering 300 px puts the footer 300 px up; closing it hands back to the bar offset', async () => {
    const listeners = new Map<string, () => void>();
    const vv = { height: 800, offsetTop: 0, addEventListener: (k: string, f: () => void) => listeners.set(k, f), removeEventListener: (k: string) => listeners.delete(k) };
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: vv });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
    try {
      await mount('/?sel=atlas');
      const detail = screen.getByRole('region', { name: 'Details' });
      expect(detail.style.getPropertyValue('--ld-footer-bottom')).toBe('');
      vv.height = 500;
      act(() => listeners.get('resize')?.());
      expect(detail.style.getPropertyValue('--ld-footer-bottom')).toBe('300px');
      vv.height = 800;
      act(() => listeners.get('resize')?.());
      expect(detail.style.getPropertyValue('--ld-footer-bottom')).toBe('');
    } finally {
      Reflect.deleteProperty(window, 'visualViewport');
    }
  });
});

describe('ListDetailPage Esc with the list hidden', () => {
  it('fill with the list hidden: Esc in the detail closes it (no hidden row to go back to)', async () => {
    const router = await mount('/?sel=atlas');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Hide list/ })));
    const title = screen.getByRole('heading', { name: 'atlas' });
    await act(async () => fireEvent.keyDown(title, { key: 'Escape' }));
    expect(router.state.location.search).toEqual({});
  });
});

describe('DetailFooter with no action', () => {
  it('draws no action row under its notice when nothing is passed, one row with an action', () => {
    const none = render(<DetailFooter notice="Purchases are off for your account.">{null}</DetailFooter>);
    expect(none.container.textContent).toContain('Purchases are off');
    expect(none.container.querySelector('[class*="footerActions"]')).toBeNull();
    none.unmount();
    const bare = render(<DetailFooter notice="Purchases are off for your account." />);
    expect(bare.container.querySelector('[class*="footerActions"]')).toBeNull();
    bare.unmount();
    const empty = render(<DetailFooter notice="x">{[false, null]}</DetailFooter>);
    expect(empty.container.querySelector('[class*="footerActions"]')).toBeNull();
    empty.unmount();
    const one = render(
      <DetailFooter notice="x">
        <button type="button">Buy</button>
      </DetailFooter>,
    );
    expect(one.container.querySelectorAll('[class*="footerActions"]')).toHaveLength(1);
  });
});

describe('DetailBody heading level', () => {
  it('a section title inside a detail body is one level below the pane title (h3 under the DetailHeader h2)', () => {
    render(
      <>
        <DetailHeader title="Order" />
        <DetailBody>
          <SubSection title="Price">
            <p>body</p>
          </SubSection>
        </DetailBody>
      </>,
    );
    expect(screen.getByRole('heading', { name: 'Order' }).tagName).toBe('H2');
    expect(screen.getByRole('heading', { name: 'Price' }).tagName).toBe('H3');
  });
});
