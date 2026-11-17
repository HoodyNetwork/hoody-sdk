// Vitest: a page header draws its own closing line unless a tab strip follows it
// directly (PageHeader `tabsFollow`). The layouts decide that for their own strips: DetailPage for its `views` and for its
// `tabs` when no banner or notice sits between, ListDetailPage and SettingsPage for their `views`. A header object's own
// `tabsFollow` wins.
// jsdom has no layout: the class is the contract here, the drawn line is pinned in headrule.spec.ts and the CSS text below.
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import { DetailPage, SettingsPage } from './Layouts';
import { ListDetailPage } from './ListDetailPage';
import { PageHeader } from './PageHeader';

async function mount(el: () => ReactElement) {
  const router = createRouter({ routeTree: createRootRoute({ component: el }), history: createMemoryHistory({ initialEntries: ['/'] }) });
  await act(async () => {
    render(<RouterProvider router={router} />);
    await router.load();
  });
}

const follows = () => {
  const header = document.querySelector('header:has(h1)');
  expect(header, 'the page header is drawn').not.toBeNull();
  return header!.classList.contains('tabsFollow');
};

const TABS = [
  { id: 'overview', label: 'Overview', content: <p>Overview body</p> },
  { id: 'ports', label: 'Ports', content: <p>Ports body</p> },
];
const VIEWS = { label: 'Views', items: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], value: 'a', onChange: () => undefined };

describe('PageHeader tabsFollow', () => {
  it('off by default: the header closes itself', async () => {
    await mount(() => <PageHeader title="Keys" />);
    expect(follows()).toBe(false);
  });
  it('on when the page says a strip follows', async () => {
    await mount(() => <PageHeader title="Keys" tabsFollow />);
    expect(follows()).toBe(true);
  });
});

describe('DetailPage decides for its own strips', () => {
  it('tabs directly under the header: the strip closes it', async () => {
    await mount(() => <DetailPage header={{ title: 'web-prod-1' }} tabs={TABS} />);
    expect(follows()).toBe(true);
  });
  it('a banner between the header and the tabs: the header keeps its line', async () => {
    await mount(() => <DetailPage header={{ title: 'web-prod-1' }} banner={<p>banner</p>} tabs={TABS} />);
    expect(follows()).toBe(false);
  });
  it('a notice between the header and the tabs: the header keeps its line', async () => {
    await mount(() => <DetailPage header={{ title: 'web-prod-1' }} notice={<p>notice</p>} tabs={TABS} />);
    expect(follows()).toBe(false);
  });
  it('a view strip right under the header closes it, a banner after the strip changes nothing', async () => {
    await mount(() => <DetailPage header={{ title: 'Plans' }} views={VIEWS} banner={<p>banner</p>}>body</DetailPage>);
    expect(follows()).toBe(true);
  });
  it('no strip: the header closes itself', async () => {
    await mount(() => <DetailPage header={{ title: 'Plans' }}>body</DetailPage>);
    expect(follows()).toBe(false);
  });
  it("the header object's own tabsFollow wins", async () => {
    await mount(() => <DetailPage header={{ title: 'web-prod-1', tabsFollow: false }} tabs={TABS} />);
    expect(follows()).toBe(false);
  });
});

describe('ListDetailPage decides for its view strip', () => {
  it('views: the strip closes the header', async () => {
    await mount(() => <ListDetailPage mode="fill" header={{ title: 'Servers' }} views={VIEWS} list={<p>list</p>} detail={null} />);
    expect(follows()).toBe(true);
  });
  it('no views: the header closes itself, unless its page says a strip follows (a list toolbar opening with tabs)', async () => {
    await mount(() => <ListDetailPage mode="fill" header={{ title: 'Servers' }} list={<p>list</p>} detail={null} />);
    expect(follows()).toBe(false);
  });
  it("the header object's tabsFollow carries through", async () => {
    await mount(() => <ListDetailPage mode="fill" header={{ title: 'Inbox', tabsFollow: true }} toolbar={<p>tabs</p>} list={<p>list</p>} detail={null} />);
    expect(follows()).toBe(true);
  });
});

describe('the drawn rule (CSS text; jsdom draws nothing)', () => {
  const css = readFileSync(join(__dirname, 'PageHeader.module.css'), 'utf8');
  const block = (sel: string) => css.match(new RegExp(`(?:^|\\n)${sel.replace('.', '\\.')} \\{([^}]*)\\}`))?.[1] ?? '';
  it('every header: one --hx-rule line, 16 px above it, 12 px below', () => {
    const b = block('.header');
    expect(b).toContain('border-block-end: var(--bw) solid var(--hx-rule);');
    expect(b).toContain('padding-block-end: var(--sp-4);');
    expect(b).toContain('margin-block-end: var(--sp-3);');
  });
  it('the content starts the same distance under the closing line, with a tab strip or without', () => {
    const layouts = readFileSync(join(__dirname, 'Layouts.module.css'), 'utf8');
    const underStrip = /\n\.noticeStack \{[^}]*padding-block-end: (var\(--sp-\d\));/.exec(layouts)?.[1];
    const underRule = /margin-block-end: (var\(--sp-\d\));/.exec(block('.header'))?.[1];
    expect(underStrip, 'the strip pads its own end').toBeDefined();
    expect(underRule).toBe(underStrip);
  });
  it('tabs follow: no line, 12 px, no margin', () => {
    const b = block('.tabsFollow');
    expect(b).toContain('border-block-end: 0;');
    expect(b).toContain('margin-block-end: 0;');
    expect(b).toContain('padding-block-end: var(--sp-3);');
  });
  // The bubble line that also read it is gone (Home's Ask ideas are line-less plates now).
  it('--hx-rule is #c4c4c4, dark rgb(255 255 255 / 24%)', () => {
    const tokens = readFileSync(join(__dirname, '..', 'tokens.css'), 'utf8');
    expect(tokens).toMatch(/--hx-rule: #c4c4c4;/);
    expect(tokens).toMatch(/--hx-rule: rgb\(255 255 255 \/ 24%\);/);
  });
});

describe('SettingsPage decides for its view strip', () => {
  const SECTIONS = [{ id: 'a', title: 'A', content: <p>a body</p> }];
  it('views: the strip is drawn under the header and closes it, above the notice', async () => {
    await mount(() => <SettingsPage header={{ title: 'Get notified' }} views={VIEWS} notice={<p>notice</p>} sections={SECTIONS} />);
    expect(follows()).toBe(true);
    // header, then the strip, then the notice: siblings in that order
    const header = document.querySelector('header:has(h1)')!;
    const strip = header.nextElementSibling!;
    expect(strip.querySelector('[role="tablist"]'), 'the view strip directly follows the header').not.toBeNull();
    expect(strip.nextElementSibling!.textContent, 'the notice directly follows the strip').toBe('notice');
  });
  it('no views: the header closes itself', async () => {
    await mount(() => <SettingsPage header={{ title: 'Settings' }} sections={SECTIONS} />);
    expect(follows()).toBe(false);
  });
  it("the header object's own tabsFollow wins over views", async () => {
    await mount(() => <SettingsPage header={{ title: 'Get notified', tabsFollow: false }} views={VIEWS} sections={SECTIONS} />);
    expect(follows()).toBe(false);
  });
});
