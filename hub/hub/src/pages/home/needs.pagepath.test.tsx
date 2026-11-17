// Vitest: Needs you checks a held change of a known page where that page lives: the path its manifest declares, as the
// shell links it (Realms lives at /realms/new), never '/' + the page id. Computers, whose path is its id, is the
// control, and a page this load does not serve gets no Check.
import { describe, expect, it } from 'vitest';
import type { PageManifest } from '@kit/page';
import { render, screen } from '@app/testing';
// eslint-disable-next-line no-restricted-imports -- the shell's served-pages provider, a test harness, not page code
import { PagesProvider } from '@shell/pageLinks';
import { links as scripts } from '../scripts/links';
import { heldLine, needsItems } from './logic';
import { NeedsYou } from './parts/NeedsYou';
import strings from './strings.en.json';

// The two pages as the shell serves them (realms/page.ts and computers/page.ts declare these paths).
const SERVED = [
  { id: 'realms', path: '/realms/new' },
  { id: 'computers', path: '/computers' },
] as unknown as PageManifest[];
const realm = { name: 'Personal', all: false };
const items = (page: string) =>
  needsItems({
    botsWaiting: undefined,
    computers: [],
    held: [heldLine({ ref: 'c1', base: `s:${page}:x`, page, identity: null, target: null, at: 1, held: true }, [], scripts.script)],
    sending: 0,
  });
const check = () => screen.queryByRole('link', { name: strings['needs.held.action'] });

describe('needs you: a held change is checked where its page lives', () => {
  it('a Realms change opens /realms/new, the path Realms declares', () => {
    render(<PagesProvider pages={SERVED}><NeedsYou items={items('realms')} realm={realm} /></PagesProvider>);
    expect(check()).toHaveAttribute('href', '/realms/new');
  });

  it('control: a Computers change opens /computers', () => {
    render(<PagesProvider pages={SERVED}><NeedsYou items={items('computers')} realm={realm} /></PagesProvider>);
    expect(check()).toHaveAttribute('href', '/computers');
  });

  it('control: a page this load does not serve gets no Check', () => {
    render(<PagesProvider pages={SERVED.filter((p) => p.id !== 'realms')}><NeedsYou items={items('realms')} realm={realm} /></PagesProvider>);
    expect(check()).toBeNull();
  });
});
