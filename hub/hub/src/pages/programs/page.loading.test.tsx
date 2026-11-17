// While the first read of the list is out, the page keeps its header (title, what it is reading, the header's
// buttons) and its tab bar; only the list's place shows loading lines. The Apps tab does the same.
import { describe, expect, it } from 'vitest';
import { renderPage, within } from '@app/testing';
import page from './page';
import strings from './strings.en.json';

describe('programs while the first read is out', () => {
  it('keeps the header, its buttons and the tab bar; the loading lines stand in the list only', async () => {
    await renderPage(page, { state: 'loading' });
    const main = within(document.body);
    expect(await main.findByRole('heading', { level: 1, name: strings.title })).toBeInTheDocument();
    expect(await main.findByText('Reading programs on atlas…')).toBeInTheDocument();
    expect(main.getByRole('tab', { name: strings['tab.running'] })).toBeInTheDocument();
    expect(main.getByRole('tab', { name: strings['tab.apps'] })).toBeInTheDocument();
    expect(main.getByRole('button', { name: strings.runApp })).toBeInTheDocument();
    const header = document.querySelector('header') as HTMLElement;
    expect(header.querySelector('[data-skeleton], [aria-busy="true"]')).toBeNull();
    expect(document.querySelector('[data-skeleton], [aria-busy="true"]')).not.toBeNull();
  });

  it('the Apps tab does the same while its list is read', async () => {
    await renderPage(page, { state: 'loading', path: '/programs?tab=apps' });
    const main = within(document.body);
    expect(await main.findByText('Apps on atlas: programs you open only when you need them.')).toBeInTheDocument();
    expect(main.getByRole('heading', { level: 1, name: strings.title })).toBeInTheDocument();
    expect(await main.findByRole('tab', { name: strings['tab.apps'] })).toBeInTheDocument();
    expect(await main.findByRole('button', { name: 'Launch an app' })).toBeInTheDocument();
    const header = document.querySelector('header') as HTMLElement;
    expect(header.querySelector('[data-skeleton], [aria-busy="true"]')).toBeNull();
  });
});
