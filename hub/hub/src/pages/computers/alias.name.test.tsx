// Making an alias starts from a suggested name (filled in, with a button for another), checked by the API's own rule
// (3 to 61 lowercase letters, digits and dashes, no dash at either end).
import { describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { aliasProblem, suggestAliasName, validAlias } from './logic';
import page from './page';
import strings from './strings.en.json';

async function openAlias() {
  await renderPage(page, { path: '/computers?sel=atlas.00a1&tab=advanced' });
  // A test may open the page a second time (the first mount stays in the document): the newest table.
  const table = (await screen.findAllByRole('table', { name: strings['ports.title'] }, { timeout: 8000 })).at(-1) as HTMLElement;
  // The 3000 row's own button: the section's "Create alias" (no port chosen) comes first on the page.
  const row = (await within(table).findByText('3000', { selector: 'td, td *' })).closest('tr') as HTMLElement;
  await userEvent.click(within(row).getByRole('button', { name: strings['alias.make'] }));
  return screen.findByRole('dialog');
}
const nameBox = (d: HTMLElement) => within(d).getByRole('textbox', { name: strings['aliasd.name'] }) as HTMLInputElement;

describe('computers: making an alias', () => {
  it('the name comes filled in with a valid suggestion, and another one is a press away', async () => {
    const d = await openAlias();
    const first = nameBox(d).value;
    expect(validAlias(first)).toBe(true);
    let next = first;
    for (let i = 0; i < 5 && next === first; i++) {
      await userEvent.click(within(d).getByRole('button', { name: strings['aliasd.suggest'] }));
      next = nameBox(d).value;
    }
    expect(next).not.toBe(first);
    expect(validAlias(next)).toBe(true);
  });

  it('an untouched suggestion closes without asking to discard; a typed name asks', async () => {
    let d = await openAlias();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await new Promise((r) => setTimeout(r, 900));
    d = await openAlias();
    await userEvent.clear(nameBox(d));
    await userEvent.type(nameBox(d), 'my-shop');
    await userEvent.keyboard('{Escape}');
    expect((await screen.findAllByText(/discard/i, {}, { timeout: 3000 })).length).toBeGreaterThan(0);
  });

  it('the name rule is the API’s: 3 to 61 characters, lowercase letters, digits and dashes, no dash at an end', () => {
    expect(validAlias('abc')).toBe(true);
    expect(validAlias('a'.repeat(61))).toBe(true);
    for (const bad of ['ab', 'a'.repeat(62), '-abc', 'abc-', 'ABC', 'a_b', 'a.b', '']) expect(aliasProblem(bad)).toBe('rule');
    // Names the API keeps for the platform: service labels whole or before a dash, `containers` exactly, host shapes.
    const hex = 'a'.repeat(24);
    for (const r of ['egress', 'egress-web', 'workspaces', 'workspace-demo', 'os-app', 'containers', `${hex}-${hex}`, `proxy-${hex}-${hex}`]) expect(aliasProblem(r)).toBe('reserved');
    for (const ok of ['egressmyapp', 'containers-my-app', 'osmium', 'my-os']) expect(validAlias(ok)).toBe(true);
  });

  it('suggestions are valid names with a long random ending, so they cannot be found by trying names', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const n = suggestAliasName();
      expect(validAlias(n)).toBe(true);
      expect(n).toMatch(/^[a-z]+-[a-z]+-[0-9a-z]{16}$/);
      seen.add(n);
    }
    expect(seen.size).toBe(200);
    // The ending comes from the random bytes it is given: different bytes, different ending.
    const fixed = (v: number) => (k: number) => new Uint8Array(k).fill(v);
    expect(suggestAliasName(fixed(1))).not.toBe(suggestAliasName(fixed(2)));
  });
});
