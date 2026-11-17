// Vitest: on a phone-sized page the "What keeps going wrong" strip starts collapsed, so its chips do not push the list
// below the fold; its toggle opens it. On a wide page it starts open (unless the person closed it). Size comes from the
// page frame (#hub-main), never the viewport.
import { afterEach, describe, expect, it } from 'vitest';
import { act, renderPage, screen, userEvent } from '@app/testing';
import strings from './strings.en.json';

const { default: page } = await import('./page');
const table = strings as Record<string, string>;

const mainOf = (width: number) => {
  const main = document.createElement('div');
  main.id = 'hub-main';
  Object.defineProperty(main, 'clientWidth', { configurable: true, get: () => width });
  document.body.appendChild(main);
};
const chipGroups = () => document.querySelectorAll('[class*="chipGroup"]');

describe('problem strip on a phone', () => {
  afterEach(() => document.getElementById('hub-main')?.remove());

  it('starts collapsed at 390 px and opens from its toggle', async () => {
    mainOf(390);
    await renderPage(page, { path: '/logs' });
    const toggle = await screen.findByRole('button', { expanded: false, name: /▸$/ }, { timeout: 8000 });
    expect(chipGroups()).toHaveLength(0);
    await act(async () => {
      await userEvent.setup().click(toggle);
    });
    expect(await screen.findByRole('button', { expanded: true, name: new RegExp(`^${table['g.title']}`) })).toBeTruthy();
    expect(chipGroups().length).toBeGreaterThan(0);
  });

  it('starts open on a wide page', async () => {
    mainOf(1200);
    await renderPage(page, { path: '/logs' });
    await screen.findByRole('button', { expanded: true, name: new RegExp(`^${table['g.title']}`) }, { timeout: 8000 });
    expect(chipGroups().length).toBeGreaterThan(0);
  });
});
