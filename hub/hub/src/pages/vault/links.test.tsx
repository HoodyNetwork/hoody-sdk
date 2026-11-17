// Vitest: the vault's public hrefs (links.ts) open what they name on the page.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderPage, screen } from '@app/testing';
import { resetChanges } from '@core/changes';
import page from './page';
import strings from './strings.en.json';
import { resetFixtureVaults } from './fixtures';
import { links } from './links';

beforeEach(() => {
  resetChanges();
  resetFixtureVaults();
  vi.stubGlobal('isSecureContext', true);
  return () => vi.unstubAllGlobals();
});

describe('vault links', () => {
  it('names the list, the New form and one entry', () => {
    expect(links.list).toBe('/vault');
    expect(links.create).toBe('/vault?edit=new');
    expect(links.item('deploy.notes')).toBe('/vault?sel=deploy.notes');
    expect(links.item('a&b=c')).toBe('/vault?sel=a%26b%3Dc');
  });

  it('create opens the New entry form', async () => {
    await renderPage(page, { path: links.create });
    expect(await screen.findByLabelText(strings['edit.name'])).toBeTruthy();
    expect(screen.getByRole('dialog', { name: strings['edit.newTitle'] })).toBeTruthy();
  });

  it('item opens that entry', async () => {
    await renderPage(page, { path: links.item('deploy.notes') });
    expect(await screen.findByText(strings['detail.facts'])).toBeTruthy();
  });
});
