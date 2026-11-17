// No Home card with View all has a ⋯ menu; its Hide is in Customize. First steps (Hide is a
// lasting dismiss) and URL cards (open, reload, rename, size, remove) keep theirs, shown always, never only on hover.
import { render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, waitFor } from '@app/testing';
import page from '../page';
import homeStrings from '../strings.en.json';
import { WidgetFrame } from './WidgetFrame';
import '../testWaits';

const src = (p: string) => readFileSync(join(__dirname, p), 'utf8');

describe('Home card menus', () => {
  it('a contributed card shows View all and no menu button in its header', () => {
    const item = { key: 'bots:list', pageId: 'bots', id: 'list', title: 'Bots', size: 's' as const, order: 1, href: '/bots', Component: () => null };
    render(<WidgetFrame item={item} />);
    const head = document.querySelector('header')!;
    expect(head.querySelector('a')).not.toBeNull();
    expect(head.querySelector('button')).toBeNull();
  });

  it("Home's own Hide-only cards pass no menu; Customize holds their Hide", () => {
    for (const f of ['WidgetFrame.tsx', 'RealmsCard.tsx', 'ShortcutsCard.tsx', 'QuickActions.tsx']) expect(src(f), f).not.toMatch(/\bmenu=/);
  });

  it('Customize hides and brings back the cards that lost their menu (Start something, Shortcuts)', async () => {
    await renderPage(page, { path: '/home?customize=1' });
    const sw = (title: string) => screen.findByRole('switch', { name: title });
    const card = (title: string) => screen.queryByRole('heading', { level: 2, name: title });
    const done = async () => {
      await userEvent.click(screen.getByRole('button', { name: homeStrings['customize.done'] }));
      await waitFor(() => expect(screen.queryByRole('dialog', { name: homeStrings['customize.title'] })).toBeNull());
    };
    // Contributed cards share this switch and hideWidget (view.tsx); this test page has none, so Home's own two stand in.
    const titles = [homeStrings['actions.title'], homeStrings['keys.title']];
    for (const title of titles) {
      expect(await sw(title)).toBeChecked();
      await userEvent.click(await sw(title));
      expect(await sw(title)).not.toBeChecked();
    }
    await done();
    for (const title of titles) await waitFor(() => expect(card(title)).toBeNull());
    await userEvent.keyboard('c');
    for (const title of titles) await userEvent.click(await sw(title));
    await done();
    for (const title of titles) expect(await screen.findByRole('heading', { level: 2, name: title })).toBeTruthy();
  });

  it('First steps and URL cards keep their menu', () => {
    expect(src('FirstSteps.tsx')).toMatch(/\bmenu=/);
    expect(src('../widgets/WidgetCard.tsx')).toMatch(/\bmenu=\{menu\}/);
  });
});
