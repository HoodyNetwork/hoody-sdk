// The Board on a coarse pointer (a phone or tablet by touch): no hint names a key the person cannot press. While a
// program has the keys, the tile header says how to leave by touch (any tap outside the tile leaves), and the empty
// Board does not send them to "?" for keys. A fine pointer keeps the key hints.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { resetBoardsForTests } from './data';
import page from './page';
import { resetFixtureSessions } from './fixtures';
import { findTile } from './parts/browse.testkit';
// The worded Add a program (the empty slot's, or the strip's): the chips row's + carries the same name.
const addWords = async () => (await screen.findAllByRole('button', { name: /Add a program/ })).find((b) => b.textContent?.includes('Add a program'))!;

// The pointer is the kit's media question; tests answer it.
let coarse = false;
vi.mock('@kit', async (orig) => {
  const kit = await orig<Record<string, unknown> & { useMedia: (q: string) => boolean }>();
  return { ...kit, useMedia: (q: string) => (q === '(pointer: coarse)' ? coarse : kit.useMedia(q)) };
});

beforeEach(() => {
  resetFixtureSessions();
  resetBoardsForTests();
  coarse = false;
});

const tileGroup = (name: RegExp) => screen.getByRole('group', { name });
const pick = async (user: ReturnType<typeof userEvent.setup>, program: RegExp, session?: RegExp) => {
  await user.click(await addWords());
  await user.click(await screen.findByRole('row', { name: /atlas/ }));
  await user.click(await findTile(program));
  // A program's sessions are tiles too.
  if (session) await user.click(await screen.findByRole('row', { name: session }));
};

describe('Board on a coarse pointer', () => {
  it('a terminal that has the keys says to tap outside, never Ctrl+Alt+B', async () => {
    coarse = true;
    const user = userEvent.setup();
    await renderPage(page);
    await pick(user, /Terminal/, /^terminal-1/);
    await screen.findByTitle('terminal-1 on atlas');
    const g = tileGroup(/terminal-1/);
    await waitFor(() => expect(g.getAttribute('data-hub-keys')).toBe('frame'));
    expect(within(g).getByText('Tap outside to leave')).toBeInTheDocument();
    expect(within(g).queryByText(/Ctrl\+Alt\+B|click outside/)).not.toBeInTheDocument();
  });

  it('a program that does not forward the chord (Files) says the same', async () => {
    coarse = true;
    const user = userEvent.setup();
    await renderPage(page);
    await pick(user, /Files/);
    await screen.findByTitle('files-1 on atlas');
    const g = tileGroup(/files-1/);
    await waitFor(() => expect(g.getAttribute('data-hub-keys')).toBe('frame'));
    expect(within(g).getByText('Tap outside to leave')).toBeInTheDocument();
    expect(within(g).queryByText(/click outside/)).not.toBeInTheDocument();
  });

  it('the empty Board offers the add without sending the person to keys', async () => {
    coarse = true;
    await renderPage(page);
    expect(await screen.findByText('Put your computers side by side')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Add a program/ }).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Press \? for keys/)).not.toBeInTheDocument();
  });

  it('a fine pointer keeps the key hint on a program that has the keys', async () => {
    const user = userEvent.setup();
    await renderPage(page);
    expect(await screen.findByText('Put your computers side by side')).toBeInTheDocument();
    await pick(user, /Terminal/, /^terminal-1/);
    await screen.findByTitle('terminal-1 on atlas');
    const g = tileGroup(/terminal-1/);
    await waitFor(() => expect(g.getAttribute('data-hub-keys')).toBe('frame'));
    expect(within(g).getByText('Keys go to the program · Ctrl+Alt+B to leave')).toBeInTheDocument();
  });
});
