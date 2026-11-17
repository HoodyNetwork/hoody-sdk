// Vitest: how a list of several Bots names one (a column of identical names such as "Chief" gives no way
// to tell them apart). The rule (the TUI's botsDisplayName): the name alone while it is unambiguous; with the computer
// when the Bots span computers or the name repeats; with the realm too when the same name repeats on one computer.
import { describe, expect, it } from 'vitest';
import { renderPage, screen, within } from '@app/testing';
import { botDisplayName } from './logic';
import page from './page';

type Row = { key: string; name: string; computerId: string; realmName: string };
const bot = (key: string, name: string, computerId: string, realmName = 'Personal'): Row => ({ key, name, computerId, realmName });
const NAMES: Record<string, string> = { 'c-atlas': 'atlas', 'c-cedar': 'cedar' };
const nameOf = (id: string) => NAMES[id];

describe('botDisplayName', () => {
  it('one computer, every name different: the name alone', () => {
    const all = [bot('1', 'Chief', 'c-atlas'), bot('2', 'Support', 'c-atlas')];
    expect(all.map((r) => botDisplayName(r, all, nameOf))).toEqual([{ name: 'Chief' }, { name: 'Support' }]);
  });

  it('a "Chief" on each computer: every row names its computer', () => {
    const all = [bot('1', 'Chief', 'c-atlas'), bot('2', 'chief ', 'c-cedar')];
    expect(all.map((r) => botDisplayName(r, all, nameOf))).toEqual([
      { name: 'Chief', computer: 'atlas' },
      { name: 'chief ', computer: 'cedar' },
    ]);
  });

  it('Bots on several computers: a unique name still shows its computer, so the column reads one way', () => {
    const all = [bot('1', 'Chief', 'c-atlas'), bot('2', 'Scout', 'c-cedar')];
    expect(botDisplayName(all[0]!, all, nameOf)).toEqual({ name: 'Chief', computer: 'atlas' });
  });

  it('the same name twice on one computer (two realms): the realm is added', () => {
    const all = [bot('1', 'Chief', 'c-atlas', 'Personal'), bot('2', 'Chief', 'c-atlas', 'Acme client'), bot('3', 'Chief', 'c-cedar')];
    expect(all.map((r) => botDisplayName(r, all, nameOf))).toEqual([
      { name: 'Chief', computer: 'atlas', realm: 'Personal' },
      { name: 'Chief', computer: 'atlas', realm: 'Acme client' },
      { name: 'Chief', computer: 'cedar' },
    ]);
  });

  it('names match trimmed and without case: "Chief" and "chief " on one computer get their realms', () => {
    const all = [bot('1', 'Chief', 'c-atlas', 'Personal'), bot('2', 'chief ', 'c-atlas', 'Acme client')];
    expect(all.map((r) => botDisplayName(r, all, nameOf))).toEqual([
      { name: 'Chief', computer: 'atlas', realm: 'Personal' },
      { name: 'chief ', computer: 'atlas', realm: 'Acme client' },
    ]);
  });

  it('two computers with the same name: each "Chief" shows its computer handle (name.abcd), so the rows never read alike', () => {
    const names: Record<string, string> = { 'c-one-1111': 'atlas', 'c-two-2222': 'Atlas ', 'c-cedar': 'cedar' };
    const all = [bot('1', 'Chief', 'c-one-1111'), bot('2', 'Chief', 'c-two-2222'), bot('3', 'Scout', 'c-cedar')];
    expect(all.map((r) => botDisplayName(r, all, (id) => names[id]))).toEqual([
      { name: 'Chief', computer: 'atlas.1111' },
      { name: 'Chief', computer: 'Atlas.2222' },
      { name: 'Scout', computer: 'cedar' },
    ]);
  });

  it('two computers with the same name but Bots with different names: the labels differ, so the plain computer name stays', () => {
    const names: Record<string, string> = { 'c-one-1111': 'atlas', 'c-two-2222': 'atlas' };
    const all = [bot('1', 'Chief', 'c-one-1111'), bot('2', 'Scout', 'c-two-2222')];
    expect(all.map((r) => botDisplayName(r, all, (id) => names[id]))).toEqual([
      { name: 'Chief', computer: 'atlas' },
      { name: 'Scout', computer: 'atlas' },
    ]);
  });

  it('two computers of one name, every "Chief" in its own realm: the realms already tell them apart, so no handle', () => {
    const names: Record<string, string> = { 'c-one-1111': 'atlas', 'c-two-2222': 'atlas' };
    const all = [
      bot('1', 'Chief', 'c-one-1111', 'Personal'), bot('2', 'Chief', 'c-one-1111', 'Acme client'),
      bot('3', 'Chief', 'c-two-2222', 'Studio'), bot('4', 'Chief', 'c-two-2222', 'Lab'),
    ];
    expect(all.map((r) => botDisplayName(r, all, (id) => names[id]))).toEqual([
      { name: 'Chief', computer: 'atlas', realm: 'Personal' },
      { name: 'Chief', computer: 'atlas', realm: 'Acme client' },
      { name: 'Chief', computer: 'atlas', realm: 'Studio' },
      { name: 'Chief', computer: 'atlas', realm: 'Lab' },
    ]);
  });

  it('two computers of one name, one realm name on both: only the two rows that read alike get the computer handle', () => {
    const names: Record<string, string> = { 'c-one-1111': 'atlas', 'c-two-2222': 'atlas' };
    const all = [
      bot('1', 'Chief', 'c-one-1111', 'Personal'), bot('2', 'Chief', 'c-one-1111', 'Acme client'),
      bot('3', 'Chief', 'c-two-2222', 'personal '), bot('4', 'Chief', 'c-two-2222', 'Lab'),
    ];
    expect(all.map((r) => botDisplayName(r, all, (id) => names[id]))).toEqual([
      { name: 'Chief', computer: 'atlas.1111', realm: 'Personal' },
      { name: 'Chief', computer: 'atlas', realm: 'Acme client' },
      { name: 'Chief', computer: 'atlas.2222', realm: 'personal ' },
      { name: 'Chief', computer: 'atlas', realm: 'Lab' },
    ]);
  });

  it('two rows alike on one computer (same name, same realm name): a computer handle cannot tell them apart, so none is added', () => {
    const all = [bot('1', 'Chief', 'c-atlas', 'Personal'), bot('2', 'Chief', 'c-atlas', 'Personal'), bot('3', 'Chief', 'c-cedar')];
    expect(all.map((r) => botDisplayName(r, all, nameOf))).toEqual([
      { name: 'Chief', computer: 'atlas', realm: 'Personal' },
      { name: 'Chief', computer: 'atlas', realm: 'Personal' },
      { name: 'Chief', computer: 'cedar' },
    ]);
  });

  it('a computer name shared only by Bots of one computer is not a clash: the plain name stays', () => {
    const all = [bot('1', 'Chief', 'c-atlas', 'Personal'), bot('2', 'Chief', 'c-atlas', 'Acme client'), bot('3', 'Scout', 'c-cedar')];
    expect(botDisplayName(all[0]!, all, nameOf)).toEqual({ name: 'Chief', computer: 'atlas', realm: 'Personal' });
  });

  it('a computer the caller cannot name: the last four characters of its id', () => {
    const all = [bot('1', 'Chief', 'c-atlas'), bot('2', 'Chief', 'ffff0000aaaa9f3e')];
    expect(botDisplayName(all[1]!, all, nameOf)).toEqual({ name: 'Chief', computer: '9f3e' });
  });
});

// The Home card as Home mounts it: the bots page's widget, here rendered as the page's view on the page's fixtures.
const widgetPage = { ...page, load: () => import('./widget') };

describe('Home > Bots card names the computer', () => {
  it('Bots on two computers: each row shows its computer', async () => {
    await renderPage(widgetPage);
    const list = await screen.findByRole('list', { name: 'Bots' });
    expect(within(list).getByText('Chief · atlas')).toBeInTheDocument();
    expect(within(list).getByText('Scout · cinder')).toBeInTheDocument();
  });

  it('Bots on one computer with distinct names: the names alone', async () => {
    await renderPage(widgetPage, { state: 'partial' });
    const list = await screen.findByRole('list', { name: 'Bots' });
    expect(within(list).getByText('Chief')).toBeInTheDocument();
    expect(within(list).queryByText(/ · atlas$/)).toBeNull();
  });
});
