// Create alias with no port given: Make alias is off while the Port box is empty or the alias name is emptied, and the
// footer now says which. Before this the drawer opened with an empty Port and a button that was simply off (the Port
// field has no help line: its rule shows only as the error of a bad value).
// Replaced: as alias.anyport.test.tsx (the listeners a computer reports).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import type * as dataModule from './data';
import { links } from './links';
import page from './page';
import strings from './strings.en.json';

let mode: 'real' | 'none' = 'none';
vi.mock('./data', async (orig) => {
  const real = await orig<typeof dataModule>();
  return {
    ...real,
    useRuntime: (id: string | undefined, enabled: boolean) => {
      const q = real.useRuntime(id, enabled);
      if (!enabled || mode === 'real' || !q.data) return q;
      return { ...q, data: { ...q.data, yours: [], system: [] } };
    },
  };
});

const portBox = (d: HTMLElement) => within(d).getByRole('textbox', { name: strings['aliasd.port'] }) as HTMLInputElement;
const nameBox = (d: HTMLElement) => within(d).getByRole('textbox', { name: strings['aliasd.name'] }) as HTMLInputElement;
const go = (d: HTMLElement) => within(d).getByRole('button', { name: strings['aliasd.go'] });
const openAny = async () => {
  await renderPage(page, { path: links.alias('atlas.00a1') });
  return screen.findByRole('dialog', { name: strings['alias.make'] }, { timeout: 8000 });
};

beforeEach(() => {
  mode = 'none';
});

describe('computers: Create alias says what is missing', () => {
  it('an empty Port: the footer asks for it; typed, the line goes and the button is on', async () => {
    const d = await openAny();
    expect(portBox(d)).toHaveValue('');
    expect(go(d)).toBeDisabled();
    expect(within(d).getByText(strings['aliasd.needPort'])).toBeInTheDocument();
    await userEvent.type(portBox(d), '8080');
    await waitFor(() => expect(go(d)).toBeEnabled());
    expect(within(d).queryByText(strings['aliasd.needPort'])).toBeNull();
    expect(within(d).queryByText(strings['aliasd.needName'])).toBeNull();
  }, 40000);

  it('a bad port keeps its own error at the field, not the footer line', async () => {
    const d = await openAny();
    await userEvent.type(portBox(d), '65536');
    expect(go(d)).toBeDisabled();
    expect(d).toHaveTextContent(strings['aliasd.portRule']);
    expect(within(d).queryByText(strings['aliasd.needPort'])).toBeNull();
  }, 40000);

  it('a port but an emptied alias name: the footer asks for the name', async () => {
    const d = await openAny();
    await userEvent.type(portBox(d), '8080');
    await waitFor(() => expect(go(d)).toBeEnabled());
    await userEvent.clear(nameBox(d));
    await waitFor(() => expect(go(d)).toBeDisabled());
    expect(within(d).getByText(strings['aliasd.needName'])).toBeInTheDocument();
  }, 40000);
});
