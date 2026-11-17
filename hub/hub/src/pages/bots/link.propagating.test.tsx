// Vitest: the Link tab's "Applying" band counts the computers the change goes to; a link applied to one computer read
// "Applying: 0 of 1 computers done".
import { renderPage, screen } from '@app/testing';
import { makeT } from '@kit/strings';
import { beforeAll, expect, it } from 'vitest';
import page from './page';
import strings from './strings.en.json';

beforeAll(async () => {
  await import('./view');
}, 30000);

const CHIEF = 'c-atlas~a1b2c3d4e5f60718293a4b5c~chief';

it('one computer is "1 computer"; more are "N computers"', () => {
  const t = makeT(strings);
  expect(t('link.propagating', { done: 0, total: 1, count: 1 })).toBe('Applying: 0 of 1 computer done');
  expect(t('link.propagating', { done: 1, total: 3, count: 3 })).toBe('Applying: 1 of 3 computers done');
});

it('the band counts the targets the link read reports', async () => {
  await renderPage(page, { state: 'linkPropagating', path: `/bots?sel=${encodeURIComponent(CHIEF)}&tab=link` });
  expect(await screen.findByText('Applying: 1 of 3 computers done', undefined, { timeout: 10000 })).toBeInTheDocument();
});
